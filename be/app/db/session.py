from collections.abc import Iterator
from contextlib import contextmanager
import os
import threading
import time

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import PoolError, ThreadedConnectionPool

from be.app.core.config import settings

# A single process-wide connection pool. Opening a fresh psycopg2 connection per query
# (the previous behaviour) meant one request could open several TCP+TLS connections
# serially, and under concurrency this exhausted Postgres' connection slots and dominated
# latency. The pool keeps a small set of connections warm and hands them out per query.
#
# Lazily created (so importing this module never forces a DB connect) and guarded by a lock
# so concurrent first-callers don't build two pools. Sizing is env-tunable; the ceiling must
# stay under Postgres' max_connections (and any pgbouncer limit) across all workers.
_pool: ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()

DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))
# How long to wait for a free connection before giving up. Endpoints run sync in FastAPI's
# threadpool (~40 threads), so bursts can momentarily exceed DB_POOL_MAX. ThreadedConnectionPool
# raises immediately when exhausted, so we poll for a slot instead of erroring straight away.
DB_POOL_ACQUIRE_TIMEOUT = float(os.getenv("DB_POOL_ACQUIRE_TIMEOUT", "10"))
DB_POOL_ACQUIRE_POLL = 0.05


def _get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is None:
            _pool = ThreadedConnectionPool(
                minconn=DB_POOL_MIN,
                maxconn=DB_POOL_MAX,
                dsn=settings.db_dsn,
                cursor_factory=RealDictCursor,
            )
    return _pool


def _acquire(pool: ThreadedConnectionPool) -> psycopg2.extensions.connection:
    """Get a connection from the pool, waiting briefly if it's momentarily exhausted.

    ThreadedConnectionPool.getconn() raises PoolError the instant every connection is
    checked out. Under a short burst that would surface as a 500 even though a connection
    frees up milliseconds later, so we retry until DB_POOL_ACQUIRE_TIMEOUT before giving up.
    """
    deadline = time.monotonic() + DB_POOL_ACQUIRE_TIMEOUT
    while True:
        try:
            return pool.getconn()
        except PoolError:
            if time.monotonic() >= deadline:
                raise
            time.sleep(DB_POOL_ACQUIRE_POLL)


@contextmanager
def get_db_connection() -> Iterator[psycopg2.extensions.connection]:
    pool = _get_pool()
    connection = _acquire(pool)
    connection.set_client_encoding('UTF8')
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        # Return the connection to the pool instead of closing it. If it was left in a
        # broken state the pool discards it on the next health check.
        pool.putconn(connection)

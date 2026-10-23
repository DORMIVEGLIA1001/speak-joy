"""DB access for the role-play speaking scenarios (notes 14/7 · mục 3).

Read-only queries over the roleplay_scenarios / roleplay_scripts / roleplay_lines
tables created by migrations/add_roleplay_scenarios.sql. Returns plain dict rows
(the psycopg2 cursors are RealDict) so the service layer can DTO them.
"""

from be.app.db.session import get_db_connection


def list_scenarios(age: int | None = None) -> list[dict]:
    """All scenarios, optionally filtered to those covering the child's age."""
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            if age is not None:
                cursor.execute(
                    """
                    SELECT s.id, s.slug, s.title_en, s.title_vi, s.persona_en, s.persona_vi,
                           s.emoji, s.greeting_en, s.greeting_vi, s.age_min, s.age_max,
                           s.scenario_order, COUNT(sc.id) AS script_count
                    FROM roleplay_scenarios s
                    LEFT JOIN roleplay_scripts sc ON sc.scenario_id = s.id
                    WHERE %s BETWEEN s.age_min AND s.age_max
                    GROUP BY s.id
                    ORDER BY s.scenario_order ASC, s.id ASC
                    """,
                    (age,),
                )
            else:
                cursor.execute(
                    """
                    SELECT s.id, s.slug, s.title_en, s.title_vi, s.persona_en, s.persona_vi,
                           s.emoji, s.greeting_en, s.greeting_vi, s.age_min, s.age_max,
                           s.scenario_order, COUNT(sc.id) AS script_count
                    FROM roleplay_scenarios s
                    LEFT JOIN roleplay_scripts sc ON sc.scenario_id = s.id
                    GROUP BY s.id
                    ORDER BY s.scenario_order ASC, s.id ASC
                    """
                )
            return cursor.fetchall()


def get_scenario_detail(slug: str) -> dict | None:
    """One scenario with its scripts and their ordered lines (options included)."""
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, slug, title_en, title_vi, persona_en, persona_vi,
                       emoji, greeting_en, greeting_vi, age_min, age_max, scenario_order
                FROM roleplay_scenarios
                WHERE slug = %s
                LIMIT 1
                """,
                (slug,),
            )
            scenario = cursor.fetchone()
            if scenario is None:
                return None

            cursor.execute(
                """
                SELECT id, slug, script_order, title_en, title_vi
                FROM roleplay_scripts
                WHERE scenario_id = %s
                ORDER BY script_order ASC, id ASC
                """,
                (scenario["id"],),
            )
            scripts = cursor.fetchall()

            for script in scripts:
                cursor.execute(
                    """
                    SELECT id, line_order, ai_prompt_en, ai_prompt_vi, options
                    FROM roleplay_lines
                    WHERE script_id = %s
                    ORDER BY line_order ASC, id ASC
                    """,
                    (script["id"],),
                )
                script["lines"] = cursor.fetchall()

            scenario["scripts"] = scripts
            return scenario


def get_line_by_id(line_id: int) -> dict | None:
    """A single line — used by the scorer to fetch the target IPA of the chosen option."""
    with get_db_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, script_id, line_order, ai_prompt_en, ai_prompt_vi, options
                FROM roleplay_lines
                WHERE id = %s
                LIMIT 1
                """,
                (line_id,),
            )
            return cursor.fetchone()

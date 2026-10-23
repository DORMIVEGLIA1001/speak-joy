import sys
from be.app.db.session import get_db_connection

def main():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'words'")
                columns = cur.fetchall()
                print("COLUMNS OF words:")
                for col in columns:
                    print(f"  {col['column_name']}: {col['data_type']}")
                    
                cur.execute("SELECT word, definition, example, example_translation FROM words WHERE word ILIKE 'cat' OR word ILIKE 'dog' LIMIT 5")
                rows = cur.fetchall()
                cur.execute("SELECT COUNT(*) AS cnt FROM words")
                row = cur.fetchone()
                with open("output.txt", "w", encoding="utf-8") as f:
                    f.write(f"TOTAL WORDS IN DB: {row['cnt']}\n")
    except Exception as e:
        with open("output.txt", "w", encoding="utf-8") as f:
            f.write(f"ERROR: {e}\n")

if __name__ == '__main__':
    main()

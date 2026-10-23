-- Migration: Add unique constraint on child name per parent
-- Purpose: Prevent duplicate child names within the same parent account
-- Date: 2026-10-23

-- Step 1: Handle existing duplicates by appending a number suffix
-- Find duplicates and update them with a unique suffix
DO $$
DECLARE
    parent_rec RECORD;
    child_rec RECORD;
    new_name TEXT;
    counter INTEGER;
BEGIN
    -- Loop through all parent-name combinations that have duplicates
    FOR parent_rec IN
        SELECT parent_user_id, LOWER(TRIM(name)) as normalized_name, COUNT(*) as dup_count
        FROM children
        GROUP BY parent_user_id, LOWER(TRIM(name))
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE 'Found % duplicates for parent % with name %', parent_rec.dup_count, parent_rec.parent_user_id, parent_rec.normalized_name;
        
        counter := 1;
        
        -- Update each duplicate except the first one (oldest)
        FOR child_rec IN
            SELECT id, name, parent_user_id
            FROM children
            WHERE parent_user_id = parent_rec.parent_user_id
              AND LOWER(TRIM(name)) = parent_rec.normalized_name
            ORDER BY created_at ASC
            OFFSET 1  -- Skip the first (oldest) record
        LOOP
            counter := counter + 1;
            new_name := TRIM(child_rec.name) || ' ' || counter;
            
            -- Make sure the new name is also unique for this parent
            WHILE EXISTS (
                SELECT 1 FROM children 
                WHERE parent_user_id = child_rec.parent_user_id
                  AND LOWER(TRIM(name)) = LOWER(new_name)
            ) LOOP
                counter := counter + 1;
                new_name := TRIM(child_rec.name) || ' ' || counter;
            END LOOP;
            
            -- Update the duplicate
            UPDATE children
            SET name = new_name
            WHERE id = child_rec.id;
            
            RAISE NOTICE 'Renamed child % to "%"', child_rec.id, new_name;
        END LOOP;
    END LOOP;
END $$;

-- Step 2: Add unique constraint (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_children_parent_name_unique 
ON children (parent_user_id, LOWER(TRIM(name)));

-- Add comment for documentation
COMMENT ON INDEX idx_children_parent_name_unique IS 
'Ensures each child has a unique name (case-insensitive) within their parent account. Duplicates are renamed with numeric suffixes during migration.';

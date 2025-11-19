# Plan: Convert `calculate_stats` to Async

## Current Implementation Overview

The `calculate_stats()` function is a complex, multi-step process that:

1. **Loads matches** from database (locked-in sessions only) via `load_matches_from_database()`
2. **Processes matches** through the calculation engine (`calculation_service.process_matches()`)
3. **Flushes derived stats tables** (elo_history, opponent_stats, partnership_stats)
4. **Updates/inserts player stats** in the players table (denormalized stats)
5. **Updates match ELO changes** in the matches table
6. **Builds match_id_map** for ELO history tracking
7. **Inserts ELO history** records
8. **Inserts partnership stats** records
9. **Inserts opponent stats** records

## Key Challenges

1. **Schema Mismatch**: The old code expects denormalized stats in the `players` table (points, games, wins, current_elo, etc.), but the new schema uses `player_season_stats` for season-specific stats.

2. **Complex Data Flow**: The function uses player names as keys, but the new schema uses player IDs. Need to map between names and IDs.

3. **Match ID Mapping**: The function builds a complex mapping between Match objects and database match IDs for ELO history tracking.

4. **Bulk Operations**: Uses `executemany` for bulk inserts which needs to be converted to async bulk operations.

5. **Transaction Management**: Currently uses a single transaction for all operations - need to ensure proper async transaction handling.

## Conversion Strategy

### Phase 1: Create Async Helper Functions

1. **`load_matches_from_database_async(session)`**
   - Load matches from locked-in sessions
   - Join with players table to get player names
   - Convert to Match objects
   - Returns: `List[Match]`

2. **`flush_derived_stats_async(session)`**
   - Delete all records from:
     - `elo_history`
     - `opponent_stats`
     - `partnership_stats`
   - Use async delete operations

3. **`update_player_stats_async(session, tracker)`**
   - For each player in tracker:
     - Get or create player by name
     - Update/create `player_season_stats` (or update denormalized players table if still using it)
   - Use bulk upsert operations

4. **`update_match_elo_changes_async(session, match_list, tracker)`**
   - Update ELO changes in matches table
   - Match Match objects to database records
   - Use bulk update operations

5. **`insert_elo_history_async(session, tracker, match_id_map)`**
   - Insert ELO history records
   - Use bulk insert operations

6. **`insert_partnership_stats_async(session, tracker, player_id_map)`**
   - Insert partnership stats
   - Use bulk insert operations

7. **`insert_opponent_stats_async(session, tracker, player_id_map)`**
   - Insert opponent stats
   - Use bulk insert operations

### Phase 2: Main Function

**`calculate_stats_async(session)`**
- Orchestrates all the helper functions
- Manages transaction boundaries
- Returns: `{"player_count": int, "match_count": int}`

## Implementation Details

### 1. Match Loading
```python
async def load_matches_from_database_async(session: AsyncSession) -> List[Match]:
    # Query matches from locked-in sessions
    # Join with players to get names
    # Convert to Match objects
    # Return list
```

### 2. Stats Flushing
```python
async def flush_derived_stats_async(session: AsyncSession):
    await session.execute(delete(EloHistory))
    await session.execute(delete(OpponentStats))
    await session.execute(delete(PartnershipStats))
    await session.commit()
```

### 3. Player Stats Update
**Decision Point**: Should we:
- **Option A**: Update denormalized `players` table (simpler, matches old behavior)
- **Option B**: Update `player_season_stats` table (more correct, but requires season context)

**Recommendation**: Start with Option A for compatibility, then migrate to Option B later.

### 4. Bulk Operations
Use SQLAlchemy's async bulk operations:
- `session.execute(insert(Model).values([...]))` for bulk inserts
- `session.execute(update(Model).where(...).values(...))` for bulk updates

### 5. Match ID Mapping
Build mapping by matching:
- Player names (from Match objects)
- Scores
- Date
- Session ID (if available)

## Testing Strategy

1. **Unit Tests**: Test each helper function independently
2. **Integration Tests**: Test full `calculate_stats_async` flow
3. **Data Validation**: Compare results with sync version
4. **Performance Tests**: Ensure async version is at least as fast

## Migration Path

1. Implement async version alongside sync version
2. Add feature flag to switch between sync/async
3. Test thoroughly in development
4. Switch to async in production
5. Remove sync version after validation

## Estimated Complexity

- **Time**: 4-6 hours
- **Risk**: Medium (complex data transformations)
- **Dependencies**: None (can be done independently)

## Notes

- The `calculation_service.process_matches()` function is already sync and doesn't need to be async (it's pure Python computation)
- Consider caching player_id_map to avoid repeated lookups
- May need to handle race conditions if multiple calculate_stats calls happen simultaneously



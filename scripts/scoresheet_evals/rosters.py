"""Build a controlled single-first-name benchmark without changing game labels."""

from copy import deepcopy


def unique_first_name_case(case):
    result = deepcopy(case)
    required = {
        player for game in case["expected"] for team in ("t1", "t2") for player in game[team]
    }
    groups = {}
    for member in case["members"]:
        name = (member.get("player_name") or "").strip()
        if not name:
            raise ValueError("Roster members need names before deduplication")
        groups.setdefault(name.split()[0].casefold(), []).append(member)
    selected = []
    for group in groups.values():
        referenced = [member for member in group if member["player_id"] in required]
        if len(referenced) > 1:
            raise ValueError(
                "The reference games require multiple players with the same first name; cannot deduplicate without changing truth"
            )
        selected.append(
            referenced[0] if referenced else min(group, key=lambda member: member["player_id"])
        )
    kept = {member["player_id"] for member in selected}
    if not required.issubset(kept):
        raise ValueError("Some reference players are missing from the supplied roster")
    result["members"] = selected
    for game in result.get("photo_reference", []):
        for team in ("t1", "t2"):
            for slot in game[team]:
                slot["acceptable_player_ids"] = [
                    player for player in slot["acceptable_player_ids"] if player in kept
                ]
                if not slot["acceptable_player_ids"]:
                    raise ValueError(
                        "Deduplication removed all acceptable identities for a photo slot"
                    )
    result["roster_variant"] = "one_player_per_first_name"
    result["original_roster_size"] = len(case["members"])
    return result

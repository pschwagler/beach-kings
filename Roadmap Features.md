# Non User Players

- Allow users to add games with non-user Players
- Keep track of these players to add in another game
- Ability to track and invite them to join the app
- ELO not tracked in games with non-user players
- Season points/rating not counted in games with non-user players

When creating games
- Add New Player
    - disclaimer, rating & stats not tracked unless user logs in
    - Add by phone number?

# Invite players to league

<!-- Option 1:
- Show in league before the accept with a "pending" (Player needs to accept invite)
- Allow to add games with them before they actually accept?
Option 2: -->
- Only in league or counted in league/season games after they accept the invite
- Share invite widgets (text, whatsapp, email, etc.)


# Non-League games
- Create games from home page (widget), from My Games, or navbar
    - Opens a new session
    - All players can see the session in their games
    - Click to invite players to the session to log new games or follow along
        - Players should be able to see the session even if they're not part of a game logged yet
        - Session page? (URL not by ID, by a unique code)
- All players should be able to quickly see their open sessions
    - notification bell pulses? Or pulsing recording icon added to the navbar
    - "Open sessions" tab, or integrated into My Games?

** TODO: invite to session via link
- what if I don't want to be in session, shouldn't get to be invited again
- what if I want to remove someone from a session, they shouldn't be able to access?
- read only vs edit access

## Session Update
- Session auto-submit after XX hours?


## Game Edit history
- Click on game, see audit history of edits made


# Tournaments



## Player graph
- Build graph of everyone you've played against, friended, in a league with, kind of like linkedIn (1st connection, 2nd connection, etc.)


## Import from other data sources
- agent webscraping?


# Tech Debt

## Split up styling per page
- easier for native mobile app migration
- smaller context eatup


## Migrate to toast for form feedback

Using a global toast or notification system (like the existing NotificationContext) would provide a more consistent UX for feedback messages across the application.
# APPLICATION SPECIFICATION V1 - WEBSITE

### Open Questions
- What to do about mixed gender leagues? (Mark out of scope for now)
- Should I start people off depending on their chosen skill level?
- What if a player is not signed up as a user?
    - Rating is not tracked until they sign up and claim the player profile
    - They can still play in leagues and sessions, but their rating is not tracked until they sign up
- Should the players table be seeded with players from AVP?
    - if so, if a user realizes they are also on AVP, would we merge their players?
    - script to update AVP data would upsert, looking up avp ID first
- what to have on player table vs user table? User table always has a player, but player table can have empty user until someone claims it.
- What can players see about other players on the app, from other leagues?
- How do we handle players playing in multiple regions?

Data model todo
- photos
- season configuration table with default row
- can be part of season but not in league (left after season is over)

## Overview

- Want to see if you're the top dog of your area?
- Want to see who comes out on top in your friend group?
- Want to see how you stack up against the rest of the world?
- Want to find your best beach partner, or a new one to pair up with?
- Want to find new training partners, or the next player for your next game?
- Want to find pickup leagues in your area?
- Want to find a new beach to play at?

Welcome to Beach Kings, where you can track your beach volleyball games, turn your weekly games into a league, handle sign-ups for your next session, and learn more about your game and how you stack up against other players in your area.

## Features

Basic player features:
- [ ] Create a profile
- [ ] Add your friends
- [ ] Log your matches, as ranked or unranked
- [ ] Create or join a league
- [ ] Claim public AVP profile and link it to your profile

League configuration
- [ ] Configure point system for your seasons
- [ ] Configure season start and end dates
- [ ] Configure league settings, including the name, description, picture(s)
- [ ] Configure league location and courts
- [ ] Add a weekly session to your league
- [ ] Schedule your next session and manage sign-ups
- [ ] Create weekly sessions for your league
- [ ] Send reminders to players about the next session (campaign or whatsapp)
- [ ] Handle team pairings for your sessions
- [ ] Configure as open to new players or invite-only
- [ ] Add or remove players from the league
- [ ] Update players to be admin or member
- [ ] Connect with whatsapp group and configure to send notifications, reminders


Stats, match history, and rankings:
- [ ] See your match history and how your ranking has changed over time
- [ ] See your ranking
- [ ] See your friends' rankings
- [ ] See your stats with each partner, against each opponent, and overall

Feedback
- [ ] Widget to leave feedback about the app, or request a feature

## Concepts

- Player: A user of the application
- League: A group of players who want to play together regularly, and track their games
- Session: A single instance of the league, with a group of games played on a specific date and court
- Game or Match: A single game played between two teams, with a winner and a loser. Each game is rated and points are awarded to the winning team. Multi-game matches are not supported, each game is counted as a single match.
- Location: A major metropolitan area based on the player's city.
- Court: A location where players can play beach volleyball
- Team: A group of two players who compete in a game against another team. Teams of more than two players are not supported yet.
- Match Format: 2v2 beach volleyball only supported for now. Eventually, will support other types (2v2 grass, 3v3 beach, 3v3 grass, etc. Each match format would have it's own rating system and rankings.

## Ranking System

Current:
- ELO rating system
    - Start at 1200
    - K-factor of 40
    - Rating is calculated based on the difference in ratings between the two teams
    - Formula: new rating = old rating + K-factor * (actual result - expected result)

Future:
- Look at Pickleball or tennis rating systems for inspiration
- 

## UI/UX

Where to put
- create a new league
- join a league

### Landing Page (If not logged in)

- Sign up or login widget - "Sign up or login using your phone numberto get started logging your matches or join a league"
- rankings (men, women, )

### Dashboard Page

Be able to (whether on navbar or main page)
- create a new league
- join a league
- See all leagues, upcoming sessions
- See my overall rankings, stats, match history

Widgets (mobile feel, will be mobile app later) from top to bottom:
1. Major stats (click to view more about that particular stat) area
    - Rating
    - Total number of games played
    - ???
2. Upcoming sessions area
    - signed up for by the player first
    - Other upcoming sessions for all leagues joined by the player
4. Active seasons for all leagues joined by the player
3. Can navigate to view global rankings, location rankings, and friend rankings
5. Match history


### Account Page

#### Profile Tab
- Can edit your profile information
    - Full Name
    - Email
    - Phone Number
    - Nickname
    - Gender
    - Level (beginner, intermediate, advanced, AA, Open)
    - Age
    - Height
    - Position
    - Preferred Side
    - Default Location
    - Favorite Courts
    - Update status (text input)
- Can upload a profile picture
- Can link your AVP profile

#### Friends Tab
- See your friends
- Can add friends
- Can remove friends

### League Configuration Page
- Configure point system for your seasons
- Configure season start and end dates
- Configure league settings, including the name, description, picture(s)
- Configure league location and courts
- Schedule your next session and manage sign-ups
- Create weekly sessions for your league
- Send reminders to players about the next session
- Handle team pairings for your sessions
- Configure as open to new players or invite-only
- Add or remove players from the league
- Update players to be admin or member

### Season Configuration Page
- Configure the season for a league, including the start and end dates, and the point system
- Schedule sessions for the season, including the date and court
- Manage when sign-ups open for the sessions

### League Page
- See all seasons for a league, past results, and upcoming sessions
- Shows active season at the top, with 

### Season Page

#### Rankings Tab
- See all players in a league, their rankings, and their stats for the season

#### Signups and Schedule Tab
- See upcoming sessions for the season, click to sign up for a session when sign-ups are open
- See the schedule for the season, click to view the schedule

#### Matches Tab
- See all past sessions for the season
- Click to create a new session
    - When session is active, log games played in the session with any league players
    - Click to lock in matches (only admin can edit after session is locked)
- Not linked to signups, just create a new session and log games played in the session with any league players


### Stats Page

### Match History Page

### Ranking History Page

## Future Features
- [ ] Support other match formats (2v2 grass, 3v3 beach, 3v3 grass, etc.)
- [ ] Support multi-game matches
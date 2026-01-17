# Beach Kings Application Architecture

This document provides architecture diagrams and technical overviews for major systems in the Beach Kings application.

## Notification System Architecture

The notification system provides real-time in-app notifications for users, supporting events like league messages, join requests, and season starts.

### System Overview

```mermaid
graph TD
    Event[Business Event] -->|Triggers| NotifService[Notification Service]
    NotifService -->|Stores| DB[(PostgreSQL notifications table)]
    NotifService -->|Broadcasts| WS[WebSocket Manager]
    WS -->|Real-time Push| Client[Frontend Client]
    Client -->|Fetch List| REST[REST API Endpoints]
    REST -->|Queries| DB
    
    subgraph Event Sources
        LeagueMsg[League Message Created]
        JoinReq[League Join Request]
        JoinApprove[Join Request Approved]
        SeasonStart[Season Created/Activated]
    end
    
    LeagueMsg --> Event
    JoinReq --> Event
    JoinApprove --> Event
    SeasonStart --> Event
```

### Data Flow

```mermaid
sequenceDiagram
    participant Event as Business Event
    participant Service as Notification Service
    participant DB as PostgreSQL
    participant WS as WebSocket Manager
    participant Client as Frontend Client
    
    Event->>Service: Trigger notification creation
    Service->>DB: Insert notification(s)
    Service->>WS: Broadcast notification
    WS->>Client: Push notification via WebSocket
    Client->>Client: Update UI (bell badge, inbox)
    
    Note over Client: User clicks bell icon
    Client->>REST: GET /api/notifications
    REST->>DB: Query notifications
    DB->>REST: Return notification list
    REST->>Client: Return notifications
    Client->>Client: Display in inbox dropdown
```

### Component Architecture

```mermaid
graph LR
    subgraph Backend
        Models[Notification Model]
        Service[Notification Service]
        WSManager[WebSocket Manager]
        Routes[REST/WebSocket Routes]
    end
    
    subgraph Database
        NotifTable[(notifications table)]
    end
    
    subgraph Frontend
        Context[NotificationContext]
        Bell[NotificationBell]
        Inbox[NotificationInbox]
        API[API Client]
    end
    
    Models --> NotifTable
    Service --> Models
    Service --> WSManager
    Routes --> Service
    Routes --> WSManager
    
    API --> Routes
    Context --> API
    Bell --> Context
    Inbox --> Context
    WSManager -.->|WebSocket| Context
```

### Notification Types

The system supports the following notification types:

- **LEAGUE_MESSAGE**: Sent to all league members when a new message is posted
- **LEAGUE_JOIN_REQUEST**: Sent to league admins when someone requests to join
- **LEAGUE_INVITE**: Sent to a player when their join request is approved
- **SEASON_START**: Sent to all league members when a season becomes active
- **SEASON_ACTIVATED**: Reserved for future use when seasons are manually activated

### WebSocket Connection Management

```mermaid
stateDiagram-v2
    [*] --> Disconnected
    Disconnected --> Connecting: User logs in
    Connecting --> Connected: WebSocket opens
    Connected --> Receiving: Message received
    Receiving --> Connected: Process notification
    Connected --> Disconnected: WebSocket closes
    Connected --> Reconnecting: Connection error
    Reconnecting --> Connected: Reconnect success
    Reconnecting --> Disconnected: Reconnect timeout
    Disconnected --> [*]: User logs out
```

### Database Schema

```mermaid
erDiagram
    users ||--o{ notifications : "receives"
    notifications {
        int id PK
        int user_id FK
        string type
        string title
        text message
        text data "JSON metadata"
        boolean is_read
        datetime read_at
        string link_url
        datetime created_at
    }
```

### Integration Points

```mermaid
graph TD
    subgraph Data Service
        CreateMessage[create_league_message]
        CreateRequest[create_league_request]
    end
    
    subgraph API Routes
        AddMember[add_league_member]
        CreateSeason[create_season]
    end
    
    subgraph Notification Service
        CreateNotif[create_notification]
        CreateBulk[create_notifications_bulk]
    end
    
    CreateMessage --> CreateBulk
    CreateRequest --> CreateBulk
    AddMember --> CreateNotif
    CreateSeason --> CreateBulk
    
    CreateNotif --> WSManager[WebSocket Manager]
    CreateBulk --> WSManager
```

### Frontend State Management

```mermaid
graph TD
    AuthContext[AuthContext] --> NotificationContext[NotificationContext]
    NotificationContext --> Bell[NotificationBell]
    NotificationContext --> Inbox[NotificationInbox]
    
    NotificationContext -->|fetch| API[API Client]
    NotificationContext -->|connect| WS[WebSocket]
    
    WS -->|onmessage| NotificationContext
    NotificationContext -->|update state| Bell
    NotificationContext -->|update state| Inbox
```

### Notification Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: Business event triggers
    Created --> Stored: Saved to database
    Stored --> Broadcast: WebSocket push
    Broadcast --> Unread: Displayed in UI
    Unread --> Read: User clicks/views
    Read --> [*]: Archived (retained in DB)
    
    note right of Created
        Notification created
        by service layer
    end note
    
    note right of Broadcast
        Real-time delivery
        via WebSocket
    end note
    
    note right of Unread
        Badge shows count
        Inbox shows list
    end note
```

## Technical Details

### Backend Components

- **Notification Model** (`apps/backend/database/models.py`): SQLAlchemy model for notifications table
- **Notification Service** (`apps/backend/services/notification_service.py`): Core business logic for notification operations
- **WebSocket Manager** (`apps/backend/services/websocket_manager.py`): Manages active WebSocket connections per user
- **REST Routes** (`apps/backend/api/routes.py`): HTTP endpoints for notification CRUD operations
- **WebSocket Route** (`apps/backend/api/routes.py`): WebSocket endpoint for real-time delivery

### Frontend Components

- **NotificationContext** (`apps/web/src/contexts/NotificationContext.jsx`): React context for notification state management
- **NotificationBell** (`apps/web/src/components/notifications/NotificationBell.jsx`): Bell icon component with unread badge
- **NotificationInbox** (`apps/web/src/components/notifications/NotificationInbox.jsx`): Dropdown inbox component
- **API Client** (`apps/web/src/services/api.js`): Functions for REST API calls

### Key Features

- **Real-time Delivery**: WebSocket connections provide instant notification delivery
- **Persistent Storage**: All notifications are stored in PostgreSQL for history
- **Pagination Support**: Efficient querying with limit/offset for large notification lists
- **Read/Unread Tracking**: Per-notification read status with timestamps
- **Bulk Operations**: Efficient bulk notification creation for league-wide events
- **Auto-reconnection**: WebSocket automatically reconnects on connection loss
- **Error Resilience**: Notification failures don't break main business operations


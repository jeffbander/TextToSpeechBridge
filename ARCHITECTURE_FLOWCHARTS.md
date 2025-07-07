# CardioCare AI - Architecture Flowcharts

## High-Level System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        UI[React Frontend]
        NAV[Navigation]
        PAGES[Pages]
    end
    
    subgraph "Application Core"
        APP[CardioCareApp]
        ORCH[CallOrchestrator]
        EVENTS[EventHandler]
    end
    
    subgraph "AI Services"
        HUME[HumeAIService]
        OPENAI[OpenAIService]
    end
    
    subgraph "Call Providers"
        TWILIO[TwilioCallProvider]
        OTHER[Other Providers]
    end
    
    subgraph "Document Management"
        DOCS[DocumentManager]
        STORAGE[Document Storage]
    end
    
    subgraph "External Services"
        HUME_API[Hume AI API]
        TWILIO_API[Twilio API]
        DATABASE[PostgreSQL]
    end
    
    UI --> APP
    APP --> ORCH
    ORCH --> HUME
    ORCH --> TWILIO
    ORCH --> DOCS
    ORCH --> EVENTS
    
    HUME --> HUME_API
    TWILIO --> TWILIO_API
    DOCS --> STORAGE
    STORAGE --> DATABASE
    
    EVENTS --> DATABASE
```

## Call Flow Architecture

```mermaid
sequenceDiagram
    participant UI as Frontend UI
    participant APP as CardioCareApp
    participant ORCH as CallOrchestrator
    participant AI as HumeAIService
    participant CALL as TwilioCallProvider
    participant DOC as DocumentManager
    participant EVENT as EventHandler
    
    UI->>APP: Start Patient Call
    APP->>ORCH: startPatientCall()
    
    ORCH->>DOC: getPatientDocuments()
    DOC-->>ORCH: Patient Documents
    
    ORCH->>AI: generatePrompt()
    AI-->>ORCH: Personalized Prompt
    
    ORCH->>AI: startConversation()
    AI-->>ORCH: Config ID
    
    ORCH->>CALL: initiateCall()
    CALL-->>ORCH: Call SID
    
    ORCH->>EVENT: emit('call_started')
    
    Note over CALL, AI: Audio Stream Processing
    
    CALL->>ORCH: Audio Stream
    ORCH->>AI: processAudioStream()
    AI-->>ORCH: Processed Audio
    ORCH->>CALL: streamAudio()
    
    CALL->>ORCH: Call Status Update
    ORCH->>EVENT: emit('call_connected')
    
    Note over AI: Conversation Processing
    
    CALL->>ORCH: Call Ended
    ORCH->>AI: endConversation()
    ORCH->>AI: analyzeConversation()
    AI-->>ORCH: Analysis Results
    
    ORCH->>EVENT: emit('call_ended')
    ORCH->>EVENT: emit('ai_analysis_complete')
    
    alt Critical/High Urgency
        ORCH->>EVENT: emit('urgent_alert')
        EVENT->>EVENT: Send Notifications
    end
    
    ORCH-->>APP: Call Session
    APP-->>UI: Call Complete
```

## General System Flow

```mermaid
flowchart TD
    START([System Start]) --> INIT[Initialize CardioCareApp]
    INIT --> CONFIG[Load Configuration]
    CONFIG --> AI_INIT[Initialize AI Service]
    AI_INIT --> CALL_INIT[Initialize Call Provider]
    CALL_INIT --> DOC_INIT[Initialize Document Manager]
    DOC_INIT --> EVENT_INIT[Initialize Event Handler]
    EVENT_INIT --> READY[System Ready]
    
    READY --> CALL_REQ[Call Request]
    CALL_REQ --> VALIDATE[Validate Request]
    VALIDATE --> GET_CONTEXT[Get Patient Context]
    GET_CONTEXT --> GET_DOCS[Retrieve Documents]
    GET_DOCS --> GEN_PROMPT[Generate AI Prompt]
    GEN_PROMPT --> START_AI[Start AI Conversation]
    START_AI --> INITIATE[Initiate Phone Call]
    
    INITIATE --> RINGING[Phone Ringing]
    RINGING --> CONNECTED{Call Connected?}
    CONNECTED -->|Yes| AUDIO_STREAM[Audio Streaming]
    CONNECTED -->|No| CALL_FAILED[Call Failed]
    
    AUDIO_STREAM --> PROCESS[Process Audio]
    PROCESS --> AI_RESPONSE[AI Response]
    AI_RESPONSE --> STREAM_BACK[Stream to Phone]
    STREAM_BACK --> CONTINUE{Continue Call?}
    CONTINUE -->|Yes| AUDIO_STREAM
    CONTINUE -->|No| END_CALL[End Call]
    
    END_CALL --> ANALYZE[Analyze Conversation]
    ANALYZE --> CHECK_URGENCY{High Urgency?}
    CHECK_URGENCY -->|Yes| ALERT[Send Alert]
    CHECK_URGENCY -->|No| SAVE[Save Results]
    ALERT --> SAVE
    SAVE --> COMPLETE[Call Complete]
    
    CALL_FAILED --> LOG_ERROR[Log Error]
    LOG_ERROR --> COMPLETE
    
    COMPLETE --> CLEANUP[Cleanup Resources]
    CLEANUP --> READY
```

## Patient Data Flow

```mermaid
graph LR
    subgraph "Data Sources"
        CSV[CSV Import]
        MANUAL[Manual Entry]
        DB[Database]
    end
    
    subgraph "Document Management"
        DOC_MGR[DocumentManager]
        ISOLATION[Patient Isolation]
        SEARCH[Document Search]
    end
    
    subgraph "AI Processing"
        CONTEXT[Context Generation]
        PROMPT[Prompt Creation]
        ANALYSIS[Post-Call Analysis]
    end
    
    subgraph "Call Execution"
        CALL[Call Session]
        STREAM[Audio Stream]
        TRANSCRIPT[Transcript]
    end
    
    CSV --> DOC_MGR
    MANUAL --> DOC_MGR
    DB --> DOC_MGR
    
    DOC_MGR --> ISOLATION
    ISOLATION --> SEARCH
    SEARCH --> CONTEXT
    
    CONTEXT --> PROMPT
    PROMPT --> CALL
    CALL --> STREAM
    STREAM --> TRANSCRIPT
    TRANSCRIPT --> ANALYSIS
    
    ANALYSIS --> DB
```

## Component Interaction Diagram

```mermaid
graph TB
    subgraph "Core Classes"
        CC[CardioCareApp<br/>Main Application]
        CO[CallOrchestrator<br/>Coordination Logic]
        EH[EventHandler<br/>System Events]
    end
    
    subgraph "AI Services"
        HAI[HumeAIService<br/>implements IAIService]
        OAI[OpenAIService<br/>implements IAIService]
    end
    
    subgraph "Call Providers"
        TCP[TwilioCallProvider<br/>implements ICallProvider]
        OCP[OtherCallProvider<br/>implements ICallProvider]
    end
    
    subgraph "Document Management"
        DM[DocumentManager<br/>implements IDocumentManager]
        DS[Document Storage]
    end
    
    subgraph "Interfaces"
        IAI[IAIService]
        ICP[ICallProvider]
        ICO[ICallOrchestrator]
        IDM[IDocumentManager]
        IEH[IEventHandler]
    end
    
    CC --> CO
    CC --> EH
    CO --> IAI
    CO --> ICP
    CO --> IDM
    CO --> IEH
    
    HAI -.implements.-> IAI
    OAI -.implements.-> IAI
    TCP -.implements.-> ICP
    OCP -.implements.-> ICP
    DM -.implements.-> IDM
    EH -.implements.-> IEH
    
    DM --> DS
```

## Data Isolation Security Model

```mermaid
graph TB
    subgraph "Security Layer"
        AUTH[Authentication]
        PATIENT_ID[Patient ID Validation]
        ACCESS[Access Control]
    end
    
    subgraph "Document Manager"
        INDEX[Patient Document Index]
        VERIFY[Ownership Verification]
        RETRIEVE[Document Retrieval]
    end
    
    subgraph "AI Service"
        CONTEXT[Context Building]
        PROMPT[Prompt Generation]
        ISOLATION[Patient Data Isolation]
    end
    
    AUTH --> PATIENT_ID
    PATIENT_ID --> ACCESS
    ACCESS --> INDEX
    INDEX --> VERIFY
    VERIFY --> RETRIEVE
    RETRIEVE --> CONTEXT
    CONTEXT --> PROMPT
    PROMPT --> ISOLATION
    
    ISOLATION --> |Only Patient's Data| CONTEXT
```

## Error Handling Flow

```mermaid
flowchart TD
    ERROR[Error Occurs] --> DETECT[Error Detection]
    DETECT --> LOG[Log Error]
    LOG --> CLASSIFY{Error Type?}
    
    CLASSIFY -->|AI Service| AI_RECOVER[AI Recovery]
    CLASSIFY -->|Call Provider| CALL_RECOVER[Call Recovery]
    CLASSIFY -->|System| SYS_RECOVER[System Recovery]
    
    AI_RECOVER --> RETRY_AI{Retry AI?}
    RETRY_AI -->|Yes| AI_RETRY[Retry AI Operation]
    RETRY_AI -->|No| FAILOVER[Failover to Backup]
    
    CALL_RECOVER --> RETRY_CALL{Retry Call?}
    RETRY_CALL -->|Yes| CALL_RETRY[Retry Call Operation]
    RETRY_CALL -->|No| END_CALL[End Call Gracefully]
    
    SYS_RECOVER --> ALERT[Send Alert]
    ALERT --> RESTART[Restart Service]
    
    AI_RETRY --> SUCCESS{Success?}
    CALL_RETRY --> SUCCESS
    SUCCESS -->|Yes| CONTINUE[Continue Operation]
    SUCCESS -->|No| FAILOVER
    
    FAILOVER --> NOTIFY[Notify Administrators]
    END_CALL --> NOTIFY
    RESTART --> NOTIFY
    
    NOTIFY --> COMPLETE[Error Handled]
    CONTINUE --> COMPLETE
```

## Event-Driven Architecture

```mermaid
graph TB
    subgraph "Event Sources"
        CALLS[Call Events]
        AI[AI Events]
        SYSTEM[System Events]
        USER[User Events]
    end
    
    subgraph "Event Processing"
        HANDLER[EventHandler]
        QUEUE[Event Queue]
        DISPATCH[Event Dispatch]
    end
    
    subgraph "Event Handlers"
        ALERT[Alert Handler]
        LOG[Logging Handler]
        NOTIFY[Notification Handler]
        ANALYSIS[Analysis Handler]
    end
    
    subgraph "Outputs"
        EMAIL[Email Alerts]
        SMS[SMS Notifications]
        DB[Database Logs]
        DASHBOARD[Dashboard Updates]
    end
    
    CALLS --> HANDLER
    AI --> HANDLER
    SYSTEM --> HANDLER
    USER --> HANDLER
    
    HANDLER --> QUEUE
    QUEUE --> DISPATCH
    
    DISPATCH --> ALERT
    DISPATCH --> LOG
    DISPATCH --> NOTIFY
    DISPATCH --> ANALYSIS
    
    ALERT --> EMAIL
    NOTIFY --> SMS
    LOG --> DB
    ANALYSIS --> DASHBOARD
```

## Performance & Scaling Considerations

```mermaid
graph TB
    subgraph "Load Balancing"
        LB[Load Balancer]
        APP1[App Instance 1]
        APP2[App Instance 2]
        APP3[App Instance N]
    end
    
    subgraph "Caching Layer"
        REDIS[Redis Cache]
        SESSION[Session Store]
        DOCS[Document Cache]
    end
    
    subgraph "Database Layer"
        PRIMARY[Primary DB]
        REPLICA[Read Replica]
        BACKUP[Backup DB]
    end
    
    subgraph "External Services"
        HUME[Hume AI]
        TWILIO[Twilio]
        CDN[Content Delivery]
    end
    
    LB --> APP1
    LB --> APP2
    LB --> APP3
    
    APP1 --> REDIS
    APP2 --> REDIS
    APP3 --> REDIS
    
    REDIS --> SESSION
    REDIS --> DOCS
    
    APP1 --> PRIMARY
    APP2 --> PRIMARY
    APP3 --> PRIMARY
    
    PRIMARY --> REPLICA
    PRIMARY --> BACKUP
    
    APP1 --> HUME
    APP2 --> TWILIO
    APP3 --> CDN
```
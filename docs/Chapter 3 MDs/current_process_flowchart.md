# Current Operations Process (Jayd's Cafe)

Based on the interview transcript provided, here is the visual representation of the **Current Process** at Jayd's Cafe. 

The flowchart specifically highlights the operational bottlenecks (in red) that currently cause delays, errors, and inefficiencies during peak hours (2:00 PM - 4:00 PM and 6:00 PM - 10:00 PM). This diagram is designed to be directly inserted into **Chapter 1: Project Context** of your thesis to justify the need for CafeOS.

```mermaid
graph TD
    classDef bottleneck fill:#ffcccc,stroke:#cc0000,stroke-width:2px,color:#900000;
    classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000000;
    classDef startend fill:#c8e6c9,stroke:#2e7d32,stroke-width:2px,color:#000000;
    classDef decision fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,color:#000000;

    Start(["Customer Arrives"]) --> Queue["Joins Physical Queue"]
    Queue --> PreOrder["Staff takes manual order while customer is in line"]
    PreOrder --> Counter["Customer reaches POS Counter"]
    
    Counter --> InputOrder["Staff inputs order into disorganized POS"]
    
    InputOrder --> CheckStock{"Are ingredients in stock?"}
    CheckStock -- No --> ChangeOrder["Customer is forced to change order causing transaction delays"]
    ChangeOrder --> InputOrder
    
    CheckStock -- Yes --> Payment{"Payment Method?"}
    Payment -- Cash --> CashDelay["Cash Transaction: Delays caused by lack of exact change"]
    Payment -- GCash --> GCashNode["Cashless Transaction: Requires manual screenshot verification"]
    
    CashDelay --> Loyalty["Loyalty Program: Physical stamping of cards is prone to cheating and loss"]
    GCashNode --> Loyalty
    
    Loyalty --> Ticket["Order Ticket Generated"]
    
    Ticket --> Prep["Preparation Phase Wait Time 10 to 30 mins"]
    
    Prep --> Errors{"Manual Errors or Missed Notes?"}
    Errors -- Yes --> FixError["Order Mix-ups Occur: Errors in iced/hot, missing customizations like less sugar"]
    FixError --> Serve
    
    Errors -- No --> Serve(["Order Successfully Served"])

    class Start,Serve startend;
    class Queue,PreOrder,Counter,GCashNode,Ticket,Prep process;
    class InputOrder,ChangeOrder,CashDelay,Loyalty,FixError bottleneck;
    class CheckStock,Payment,Errors decision;
```

### Key Bottlenecks Identified in the Current Flow:
1. **Disorganized POS & Stock Blindness**: Cashiers are often unaware of ingredient shortages until the order is being punched in, forcing the customer to change their order on the spot and holding up the line.
2. **Payment Inefficiencies**: Cash payments cause delays due to a lack of change/coins at the register. Cashless payments currently rely on manual screenshot verifications.
3. **Manual Relay Errors**: Because of manual order taking and lack of strict customization tracking, baristas often mix up details like Hot vs. Iced or specific requests like "less sugar".
4. **Vulnerable Loyalty System**: Physical stamp cards are inefficient and highly susceptible to cheating/copying.

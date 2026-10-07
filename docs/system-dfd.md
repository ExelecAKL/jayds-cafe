# Jayd's Cafe System DFD

This document contains the thesis-safe **Data Flow Diagram Level 0 and Level 1** for the current Jayd's Cafe system.

- **DFD Level 0** presents the system as one major process and shows its interaction with external entities.
- **DFD Level 1** decomposes the system into its major internal processes and shared data stores.

These diagrams are based on the implemented system in the repo: customer ordering, POS operations, admin management, Maya payment handling, Lalamove delivery support, loyalty, vouchers, and reporting.

## DFD Level 0

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#ffffff",
    "primaryTextColor": "#111111",
    "primaryBorderColor": "#111111",
    "lineColor": "#111111",
    "tertiaryColor": "#ffffff",
    "fontSize": "14px"
  }
}}%%
flowchart LR
    customer["Customer"]:::external
    staff["POS Staff"]:::external
    admin["Admin / Manager"]:::external
    maya["Maya Payment Gateway"]:::external
    lalamove["Lalamove Delivery Service"]:::external

    system["0.0<br/>Jayd's Cafe Ordering and Operations System<br/><br/><i>Ordering and Operations</i>"]:::process

    customer -->|Menu browsing, account data, order details, payment choice, tracking requests| system
    system -->|Menu information, order status, loyalty details, receipts, notifications| customer

    staff -->|Walk-in orders, payment handling, order status updates, pickup confirmation| system
    system -->|Order queue, payment records, order details, pickup information| staff

    admin -->|Menu updates, inventory updates, voucher setup, staff management, report requests| system
    system -->|Operational reports, analytics, order records, inventory data, loyalty data| admin

    system -->|Checkout requests, payment verification| maya
    maya -->|Payment results, checkout status, webhook events| system

    system -->|Delivery quotation request, booking request, status inquiry| lalamove
    lalamove -->|Quotation details, booking confirmation, delivery status| system

    classDef process fill:#ffffff,stroke:#111111,stroke-width:2px,color:#111111;
    classDef external fill:#fff2cc,stroke:#111111,stroke-width:2px,color:#111111;
```

## DFD Level 1

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#ffffff",
    "primaryTextColor": "#111111",
    "primaryBorderColor": "#111111",
    "lineColor": "#111111",
    "tertiaryColor": "#ffffff",
    "fontSize": "14px"
  }
}}%%
flowchart TB
    customer["Customer"]:::external
    staff["POS Staff"]:::external
    admin["Admin / Manager"]:::external
    maya["Maya Payment Gateway"]:::external
    lalamove["Lalamove Delivery Service"]:::external

    p1["1.0<br/>Manage User and Access Data<br/><br/><i>Authentication</i>"]:::process
    p2["2.0<br/>Maintain Menu and Inventory Data<br/><br/><i>Catalog and Stock</i>"]:::process
    p3["3.0<br/>Capture Orders and Process Payments<br/><br/><i>Ordering</i>"]:::process
    p4["4.0<br/>Manage Fulfillment and Delivery<br/><br/><i>Operations</i>"]:::process
    p5["5.0<br/>Manage Loyalty, Vouchers, and Notifications<br/><br/><i>Promotions</i>"]:::process
    p6["6.0<br/>Generate Reports and Monitoring Data<br/><br/><i>Administration</i>"]:::process

    d1[["D1<br/>Profiles"]]:::store
    d2[["D2<br/>Menu, Categories,<br/>Add-ons, Ingredients"]]:::store
    d3[["D3<br/>Orders, Order Items,<br/>Order Status History"]]:::store
    d4[["D4<br/>Vouchers, Voucher Claims,<br/>Points and Loyalty Data"]]:::store
    d5[["D5<br/>Notifications"]]:::store
    d6[["D6<br/>Delivery and Payment<br/>References"]]:::store

    customer -->|Sign up, sign in, profile updates| p1
    staff -->|Staff login, access request| p1
    admin -->|Admin login, access request| p1
    p1 <--> d1

    customer -->|Menu browse requests, item option requests| p2
    staff -->|POS menu loading| p2
    admin -->|Menu, category, add-on, ingredient, and stock updates| p2
    p2 <--> d2

    customer -->|Cart data, checkout details, order data, payment choice| p3
    staff -->|Walk-in order data, cash payment data| p3
    admin -->|Order review and payment monitoring requests| p3
    p3 <--> d3
    p3 <--> d6
    p3 -->|Create checkout and verify payment| maya
    maya -->|Payment confirmation and status| p3

    staff -->|Preparation updates, ready-for-pickup updates, pickup confirmation| p4
    customer -->|Order tracking request, delivery tracking request| p4
    admin -->|Delivery and fulfillment monitoring| p4
    p4 <--> d3
    p4 <--> d6
    p4 -->|Quotation, booking, and status request| lalamove
    lalamove -->|Quotation, booking result, delivery status| p4

    customer -->|Reward viewing, voucher use, notification viewing| p5
    admin -->|Voucher setup, loyalty configuration, promotion management| p5
    p5 <--> d4
    p5 <--> d5
    p5 <--> d1

    admin -->|Dashboard and analytics request| p6
    p6 <--> d1
    p6 <--> d2
    p6 <--> d3
    p6 <--> d4
    p6 <--> d5
    p6 <--> d6

    p2 -->|Available item data| p3
    p3 -->|Confirmed order data| p4
    p4 -->|Completed order data and customer update trigger| p5
    p3 -->|Transaction data| p6
    p4 -->|Fulfillment and delivery data| p6
    p5 -->|Loyalty and voucher data| p6

    classDef process fill:#ffffff,stroke:#111111,stroke-width:2px,color:#111111;
    classDef external fill:#fff2cc,stroke:#111111,stroke-width:2px,color:#111111;
    classDef store fill:#ffffff,stroke:#111111,stroke-width:2px,color:#111111;
```

## Process Summary

- **1.0 User and Access Management**
  Handles customer, staff, and admin authentication, profile maintenance, and role-based access.

- **2.0 Menu and Inventory Management**
  Handles menu item maintenance, categories, add-ons, ingredients, and stock availability.

- **3.0 Order and Payment Processing**
  Handles cart data, order creation, payment handling, and Maya-based payment verification.

- **4.0 Fulfillment and Delivery Management**
  Handles order preparation, order status progression, pickup confirmation, and Lalamove-linked delivery processing.

- **5.0 Loyalty, Voucher, and Notification Management**
  Handles points, rewards, voucher usage, promotional support, and customer notifications.

- **6.0 Reporting and Administrative Monitoring**
  Handles dashboards, order monitoring, inventory visibility, and operational reporting for management.

## Data Store Summary

- **D1 Profiles**
  Stores user identity and role information for customers, staff, and admins.

- **D2 Menu, Categories, Add-ons, Ingredients**
  Stores menu catalog data and stock-related records used in ordering and inventory management.

- **D3 Orders, Order Items, Order Status History**
  Stores the main transaction records and status progression of orders.

- **D4 Vouchers, Voucher Claims, Points and Loyalty Data**
  Stores promotional and loyalty-related information.

- **D5 Notifications**
  Stores customer-facing and system-generated notification records.

- **D6 Delivery and Payment References**
  Stores payment reference data and delivery-related identifiers such as Maya and Lalamove references.

## Recommended Thesis Label

For the manuscript or presentation, the safest label is:

**Figure X. Data Flow Diagram Level 0 of the Proposed Jayd's Cafe Ordering and Operations System**  
**Figure Y. Data Flow Diagram Level 1 of the Proposed Jayd's Cafe Ordering and Operations System**

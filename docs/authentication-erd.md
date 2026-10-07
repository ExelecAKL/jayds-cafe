# Authentication and User Access ERD

**Figure X. Authentication and User Access ERD of the Proposed Jayd's Cafe Ordering and Operations System**

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "creates profile"
    AUTH_USERS ||--o{ SAVED_ADDRESSES : "owns"
    AUTH_USERS ||--o{ NOTIFICATIONS : "receives"
    AUTH_USERS ||--o{ VOUCHER_CLAIMS : "claims"
    PROFILES ||--o{ ORDERS : "customer_id / staff_id"
    PROFILES ||--o{ STAFF_ACTIVITY : "role-based staff records"

    AUTH_USERS {
        UUID id PK
        TEXT email
        TEXT auth_credentials
        TIMESTAMPTZ created_at
    }

    PROFILES {
        UUID id PK_FK
        TEXT email
        TEXT full_name
        user_role role
        TEXT avatar_url
        TEXT phone
        INT points
        INT total_orders
        TEXT loyalty_tier
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    SAVED_ADDRESSES {
        UUID id PK
        UUID user_id FK
        TEXT label
        TEXT address
        NUMERIC lat
        NUMERIC lng
        TIMESTAMPTZ created_at
    }

    NOTIFICATIONS {
        UUID id PK
        UUID user_id FK
        TEXT title
        TEXT body
        notification_type type
        BOOLEAN is_read
        TIMESTAMPTZ created_at
    }

    ORDERS {
        UUID id PK
        UUID customer_id FK
        UUID staff_id FK
        TEXT order_number
        order_status status
        payment_status payment_status
        NUMERIC total
        TIMESTAMPTZ created_at
    }

    STAFF_ACTIVITY {
        UUID clock_entries_staff_id FK
        UUID shifts_staff_id FK
        UUID void_logs_staff_id FK
        UUID inventory_logs_staff_id FK
        UUID order_status_history_changed_by FK
    }

    VOUCHER_CLAIMS {
        UUID id PK
        UUID user_id FK
        UUID voucher_id FK
        UUID order_id FK
        TIMESTAMPTZ claimed_at
        TIMESTAMPTZ used_at
    }
```

## Defense Note

The authentication side of the system uses Supabase Authentication as the source of account identity through `auth.users`. The local `profiles` table extends that identity with application-specific information such as full name, role, contact details, loyalty points, and customer history. User-specific tables such as `saved_addresses`, `notifications`, and `voucher_claims` reference authenticated users, while operational tables such as `orders` and staff activity records use `profiles` to identify customers, staff, and administrators involved in the transaction flow.

## Connector Legend

- `||` means exactly one record is required on that side of the relationship.
- `o|` means zero or one record may exist on that side.
- `o<` or circle plus crow's foot means zero or many records may exist on that side.
- `|<` or bar plus crow's foot means one or many records must exist on that side.

Example: `AUTH_USERS ||--|| PROFILES` means one authenticated user account has exactly one matching profile record. `AUTH_USERS ||--o< NOTIFICATIONS` means one authenticated user may receive zero or many notification records.

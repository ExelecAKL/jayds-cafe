# Hardware Specifications

Because CafeOS is a cloud-hosted, web-based system (Progressive Web App), the hardware requirements for the end-user devices (Customer smartphones, POS tablets, Admin PCs) are relatively lightweight. The heavy processing and data storage are handled by the cloud servers (Vercel and Supabase). 

Below are the hardware specifications required to run the client-side applications effectively:

| COMPONENT | MINIMUM | RECOMMENDED |
| :--- | :--- | :--- |
| **Device** | Smartphone or Basic Tablet | Desktop PC/Laptop (for Admin), iPad or modern Android Tablet (for POS) |
| **CPU (Processor)** | 1.5 GHz Dual-Core Processor | 2.0 GHz Quad-Core Processor or higher |
| **RAM** | 2 GB RAM | 4 GB RAM or higher |
| **Storage** | 1 GB available space (for browser cache and PWA storage) | 4 GB available space |
| **Network** | 3G / 1 Mbps stable internet connection | 4G / Wi-Fi / 5 Mbps+ Broadband connection |
| **Backup** | Cloud-based automatic backup (Managed by Supabase) | Daily automated cloud backups with Point-in-Time Recovery (PITR) |

*Note: Since the system does not require local on-premise servers, there are no dedicated physical server hardware requirements. The "Backup" component relies entirely on the cloud infrastructure's automated redundancy protocols.*

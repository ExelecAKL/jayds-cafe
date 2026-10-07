## Literature and Studies

This section reviews literature and studies that are directly relevant to the proposed ordering-centered Progressive Web App for Jayd's Cafe. Following the plenary guide, the review is organized into four themes: PWA adoption and web-based mobile experience, digital ordering and queue efficiency, digital loyalty and repeat-use behavior, and Philippine MSME digitalization in food service. The discussion does not treat each source as an isolated summary. Instead, it compares findings, methodologies, scope, and limitations so that the relationship among prior works, existing practice, and the proposed system becomes clear.

### Theme 1: PWA Adoption and Web-Based Mobile Experience

Recent literature consistently positions Progressive Web Apps (PWAs) as a practical middle ground between conventional websites and native mobile applications. Fauzan et al. (2022), through a systematic literature review, identified cross-platform compatibility, cost-effectiveness, and offline readiness as the benefits most often associated with PWAs. That synthesis is reinforced by more recent implementation-oriented studies. Cherukuri (2024) emphasized the architectural role of service workers, web app manifests, and HTTPS in enabling installability, caching, and app-like interaction through the browser. Thomas and Kumar (2024) likewise described PWAs as a strong response to the fragmentation of native development because a single codebase can support responsive, mobile-first delivery without app-store dependence. Muawwal (2024), however, approached the topic more empirically by examining how PWA implementation improved website performance and mobile accessibility in practice rather than only describing the technology conceptually.

User-centered evidence also strengthens the case for PWAs. Marchetto and Morandini (2024) analyzed user perceptions of PWA features across operating systems and found that installability, icon visibility, and general accessibility contribute meaningfully to user engagement, although perceptions still vary by platform and implementation quality. Compared with the broader review of Fauzan et al. (2022), this study focuses less on adoption benefits at the organizational level and more on how end users actually experience PWA affordances. Taken together, these works are consistent in recognizing the value of browser-based distribution, performance optimization, and mobile usability, yet they differ in emphasis: the review literature is strongest in synthesizing recurring benefits and technical challenges, while the implementation and perception studies provide narrower but more concrete evidence about user experience and platform behavior.

Despite that convergence, the reviewed PWA literature leaves a clear application-level gap. Most of the discussed studies treat PWAs as a general web-delivery approach or evaluate them in broad business and usability terms. They do not sufficiently address a multi-role food-service setting where customer ordering, operational monitoring, and business administration must coexist in one lightweight system. This limitation matters for Jayd's Cafe because its needs are not limited to mobile accessibility alone; the business requires a browser-based system that supports ordering, queue relief, customization, loyalty, and internal coordination without the cost of separate native applications.

### Theme 2: Digital Ordering, Wait-Time Reduction, and Queue/Ordering Efficiency

Studies on digital ordering systems generally agree that replacing manual order capture improves both service efficiency and customer convenience, but they do so from different methodological angles. Buenaventura et al. (2021) developed a mobile ordering application for a generic fast-food restaurant and tied the problem directly to long queues and delayed service. Their study used Agile methodology and acceptability testing, making it especially relevant as a capstone-style systems development reference. Li (2024) likewise developed a web-based food ordering system and reported gains in efficiency and reduction of manual order errors. Both studies are useful because they move beyond consumer opinion and into actual system construction. However, both remain relatively general in scope and do not fully address the specific operational context of an independent cafe handling beverage customization, counter congestion, and multiple internal user roles.

Behavioral and service-quality studies complement those development-oriented works by explaining why customers continue using digital ordering platforms once such systems are available. Koay et al. (2022) found that online food delivery service quality dimensions such as reliability, assurance, security, and system operation significantly shape customer satisfaction, and that customer satisfaction is a necessary condition for customer loyalty. Gao et al. (2024) extended this line of thinking by showing that information quality, perceived usefulness, perceived ease of use, perceived convenience, and user satisfaction influence reuse intention in online food delivery applications. In the Philippine setting, Dela Rosa and Separa (2022) identified e-service quality and perceived food quality as significant contributors to e-satisfaction, while Tan and Pilar (2024) found that user experience and convenience were stronger drivers of adoption than service quality alone in the City of Mati. Compared with Buenaventura et al. (2021) and Li (2024), these studies are less about system construction and more about post-adoption behavior. Their shared implication is that a technically working ordering system is not enough; system clarity, convenience, and information quality must also be designed well enough to sustain continued use.

Queue and wait-time literature adds another layer to the discussion by showing that digital ordering is valuable not only because it supports remote ordering, but because it changes how customers experience waiting. Jo et al. (2025) compared physical and virtual restaurant queues and found that virtual queuing tends to reduce perceived waiting costs and increase waiting equity, which in turn improves customers' willingness to wait and order. This finding is particularly relevant to Jayd's Cafe, where physical buildup near the entrance during peak hours was identified as a practical problem by the owner. Compared with adoption and service-quality studies, queue studies focus more directly on customer behavior under waiting conditions and show why shifting customers away from a purely physical line can improve the overall service experience.

Collectively, the ordering literature supports digital ordering as both an operational and experiential intervention, yet a gap remains. System-development studies show that digitization can reduce manual inefficiency, while service and queue studies explain how convenience, information quality, and virtual waiting affect customer acceptance. However, much of the existing literature centers on food delivery platforms, generic restaurant ordering, or customer adoption in broad terms. Few reviewed works address a browser-accessible ordering system for an independent Philippine cafe that is simultaneously intended to reduce entrance congestion, support drink customization, and connect customer ordering with POS and admin monitoring.

### Theme 3: Digital Loyalty, Coupons, Retention, and Repeat-Use Behavior

The loyalty literature suggests that customer retention is driven not only by the existence of rewards, but by how rewards are structured, timed, and connected to user satisfaction. Koay et al. (2022) and Gao et al. (2024) both support the view that customer satisfaction remains a core pathway to repeat use and loyalty in digital food-service contexts. In these studies, information quality, convenience, and reliable system operation are not peripheral variables; they help determine whether users continue returning to the platform. This is important for Jayd's Cafe because its digital loyalty module cannot be treated as a stand-alone add-on. If the ordering experience itself is confusing or unreliable, the rewards mechanism will not be enough to create repeat patronage.

More specialized hospitality studies examine the design mechanics of loyalty programs themselves. Ko and Song (2025) found that motivation in reward programs does not increase in a simple linear fashion; rather, the perceived value of progress accelerates after customers move beyond the middle point of reward achievement. This is useful for understanding why visible progress tracking matters in digital rewards. Ladeira et al. (2024) further showed that different compensation types influence repatronage intention differently depending on customer mindset: discount coupons can be especially effective in certain conditions, while bonus reward points may be more persuasive in others. In a related experiment, Ladeira et al. (2025) found that reward timing and fairness perception meaningfully affect conative loyalty in tourism and hospitality settings. Compared with Ko and Song's focus on motivational acceleration, the Ladeira studies focus more on behavioral response to reward structure and perceived fairness. Together, these studies imply that digital loyalty design should consider not only point accumulation but also the pace, visibility, and perceived value of rewards and coupons.

The reviewed loyalty studies are highly informative, but their scope also reveals the gap relevant to this project. Much of the literature is situated in broader hospitality or platform settings rather than small independent cafes. In addition, the strongest studies explain why loyalty programs influence behavior, yet they do not directly address the practical replacement of physical stamp cards in Philippine food micro-enterprises. Jayd's Cafe's problem is operational as well as strategic: the present stamp-card setup is vulnerable to loss, inconsistency, and possible fraud, while also failing to generate usable customer data. The literature therefore supports the inclusion of digital points and coupon features, but leaves room for a study that applies those principles to a small local cafe through a browser-based system integrated with ordering.

### Theme 4: Philippine MSME Digitalization and Local Food-Service Adoption Context

Local policy and academic literature confirms that Philippine MSMEs are under strong pressure to digitalize, but the dominant pattern remains platform dependence and incremental adoption rather than custom system development. The Department of Trade and Industry's MSME Development Plan 2023-2028 frames digitalization as a national competitiveness strategy for resilience and growth (Department of Trade and Industry, 2024). Philippine News Agency (2023) likewise reported the launch of the Philippine E-Commerce Platform to support OTOP digitalization. At a broader MSME capability level, Olazo (2023) argued that digital transformation depends on the development of organizational capabilities rather than mere tool adoption, while Balba et al. (2024) reported that IT adoption in traditional industries improves customer satisfaction and operational efficiency. Compared with the DTI and PNA sources, which are policy- and program-oriented, Olazo (2023) and Balba et al. (2024) provide a more organizational and research-driven understanding of digital readiness and business-model transformation.

Food-service-specific local studies show a similar pattern. Alcira et al. (2022) examined online food MSMEs in Metro Manila and found that digital resilience was often achieved through social media adoption and adaptive communication practices rather than through dedicated ordering systems. Magsino et al. (2021) similarly highlighted that food-service establishments need digital resilience and digital security readiness when integrating digital transformation into restaurant operations. These studies are valuable because they show that local food businesses are already operating under digital pressure. However, compared with ordering-system development studies, they focus more on preparedness, resilience, and channel use than on the design of custom transactional systems.

The contrast across the local literature is therefore clear. Policy sources support digitalization at the national level, organizational studies explain the capability side of transformation, and food-service studies document the reliance on social media or general digital tools. What remains weakly addressed is the middle ground where a small Philippine cafe needs a tailored, low-overhead system for first-party ordering and retention. This is the precise space occupied by the Jayd's Cafe project. It responds to the local digitalization agenda, but it does so through a self-contained, ordering-centered web application rather than through marketplace onboarding or social media dependence alone.

### Related Systems as Practical Benchmarks

The reviewed literature is strengthened further by examining current systems that already combine digital ordering, loyalty, and restaurant operations in practice. These platforms help establish which features are already common in the market and which limitations still create space for the proposed Jayd's Cafe system.

Table 1
Related System Comparison Table

| System | A | B | C | D | E | F | G | H | I | J | K | L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Jayd's Cafe Proposed System | / | / | / | / | / | / | / | / | / | / | / | / |
| Toast POS | / | / | / | / | / | / | / | / | o | / | / | o |
| GloriaFood | / | / | o | / | / | / | o | / | / | / | o | o |
| Starbucks Rewards | o | / | / | / | / | / | / | / | o | / | / | o |
| Booky | / | / | o | / | / | / | o | o | / | o | o | o |
| Square for Restaurants | / | / | / | / | / | / | / | / | / | / | / | o |

Legend: / = feature is present or strongly supported; o = feature is absent, unavailable, not central to the reviewed system, or dependent on a separate platform or add-on. The comparison criteria are as follows: A - browser or mobile web access; B - online menu and ordering; C - POS, order dashboard, or kitchen workflow connection; D - pickup or scheduled ordering support; E - delivery support; F - digital payment support; G - digital loyalty or rewards; H - voucher, discount, or promotion support; I - QR-based ordering or confirmation; J - admin menu, sales, or reporting controls; K - inventory or stock visibility; and L - tailored ownership for Jayd's Cafe.

Table 1 shows that the proposed Jayd's Cafe system combines features that are usually distributed across separate commercial platforms. Toast, Square, GloriaFood, Starbucks Rewards, and Booky demonstrate that online ordering, digital payment, promotions, QR ordering, and loyalty mechanisms are already viable in the food-service industry. However, the comparison also shows that the existing systems are either enterprise-oriented, platform-mediated, brand-specific, discontinued for new signups, or not tailored to the exact workflow of Jayd's Cafe. This supports the need for a dedicated, lightweight, browser-accessible system that connects customer ordering with POS operations, loyalty, pickup confirmation, delivery handling, and administrative control.

#### Toast POS

Toast's online ordering platform emphasizes commission-free ordering, POS integration, flexible promotions, and loyalty-oriented guest engagement within a broader restaurant technology ecosystem (Toast, n.d.). Toast demonstrates the value of an integrated ecosystem where customer ordering, kitchen flow, and guest data remain connected. However, its strength is also its limitation in the Jayd's Cafe context: it is an enterprise-grade commercial platform with subscription structure, external service dependencies, and market assumptions that are better suited to larger operators than a single-location cafe in Cavite.

#### GloriaFood

GloriaFood offers a restaurant online ordering system with menu display, website ordering, Facebook ordering, reports, and coupon or promotion support (GloriaFood, n.d.). This makes it relevant as an example of a lower-cost ordering platform for smaller food businesses. Yet the current GloriaFood site also notes that the product has been discontinued for new signups, which raises a sustainability concern for businesses relying on third-party services. Compared with Toast, GloriaFood is lighter and more accessible, but it also provides less control over long-term continuity, customization, and local adaptation.

#### Starbucks Rewards

Starbucks Rewards remains a strong reference point for how ordering and loyalty can be tightly linked in a customer-facing digital experience. The official Starbucks Rewards page emphasizes mobile ordering, fast payment, and point-based rewards through the Starbucks app and related channels (Starbucks Coffee Company, n.d.). As a related system, Starbucks shows how a digital rewards environment can encourage repeat visits while making ordering more convenient. Its limitation for the current study is scale and architecture: Starbucks operates through a mature commercial ecosystem and native-app infrastructure that are not realistic for an independent cafe needing a more affordable browser-based approach.

#### Booky

Booky's Digital Ordering System and bookyPay are locally relevant because they demonstrate how QR ordering, digital menus, direct merchant ordering, and cashless transactions have already been introduced into the Philippine food-service environment (Booky, 2023). Among the related systems reviewed, Booky is the closest to the local context of Jayd's Cafe because it addresses Philippine food and beverage operations directly. Even so, Booky remains a platform-mediated solution in which merchants depend on external infrastructure, branding framework, and product direction. It supports the viability of digital ordering in the Philippines, but not the goal of a tailored, self-managed system for a specific local cafe.

#### Square for Restaurants

Square offers another integrated model that combines online ordering, loyalty-oriented customer engagement, QR code ordering, and POS-linked kitchen workflow support (Square, n.d.-a; Square, n.d.-b). Its strength lies in reducing wait times and connecting front-of-house and back-of-house data through one commercial ecosystem. Compared with Toast, Square highlights modularity and QR-based self-ordering more explicitly, which makes it especially relevant to queue-reduction discussions. However, like Toast, it is designed around U.S.-centric infrastructure, hardware compatibility, and commercial pricing structures that do not cleanly map onto Jayd's Cafe's local constraints.

Taken together, these related systems validate the core idea behind the proposed project: digital ordering works best when it is connected to fulfillment, customer data, and repeat-purchase incentives. At the same time, they also expose the gap that the Jayd's Cafe system intends to fill. Existing systems are either large commercial ecosystems, third-party hosted services, or app-heavy brand platforms. None of them are a lightweight, ordering-centered PWA built specifically for the operational scale, budget, and workflow of an independent Philippine cafe.

## Technical System Background

This section presents the technical foundation of the proposed Jayd's Cafe system and explains why each major technology is suited to the project's requirements. Consistent with the plenary guide, the discussion covers the programming environment, database and backend services, supporting tools and APIs, system architecture, and quality standard used for evaluation.

### Programming Environment and Frontend Frameworks

The proposed system is developed using Next.js 14 and React. According to the Next.js 14 documentation, the App Router provides a file-system-based routing model that supports nested layouts, loading states, and other full-stack web application features within a modern React environment (Next.js, 2024). React, in turn, is built around reusable components that allow user interfaces to be composed from isolated and maintainable pieces (React, n.d.). These two technologies are complementary rather than interchangeable: React supplies the component model and interactive rendering behavior, while Next.js provides application structure, routing, rendering strategy, and deployment-oriented web framework features. This combination is appropriate for Jayd's Cafe because the system serves multiple interfaces with different roles and workflows, namely the customer-facing ordering interface, the POS-facing transaction view, and the admin-facing monitoring environment.

Compared with the outdated MERN framing used in the earlier draft, this technology choice better reflects the actual implemented system and the needs of the project. The system is not simply a single-page React frontend attached to a custom Express API. It is a multi-application web system that benefits from route-aware rendering, structured layouts, and framework-supported application organization. For a thesis project that must remain maintainable while supporting several role-specific experiences, Next.js and React provide a more accurate and defensible technical foundation.

### Type-Safe Application Development

The system uses TypeScript across the applications. The TypeScript Handbook explains that as JavaScript applications grow in scope and complexity, type errors become a major source of maintainability and correctness problems, especially when developers make incorrect assumptions about values, APIs, and runtime behavior (Microsoft, n.d.). In the context of Jayd's Cafe, TypeScript is useful because the system handles interconnected data structures such as menu items, variants, orders, order items, payment states, loyalty records, and user roles. These are not isolated front-end values; they move across customer, POS, and admin contexts. Type-safe development reduces the likelihood of mismatched data structures, strengthens code readability, and supports long-term maintainability.

This is a practical advantage for the present project. The system must coordinate customer ordering, operational processing, and business oversight while keeping the codebase understandable for future maintenance or academic extension. TypeScript therefore functions as a reliability and maintainability tool rather than merely a preference in syntax.

### Database and Backend Services

The backend of the proposed system is centered on Supabase and PostgreSQL. Supabase provides a full Postgres database for every project together with integrated services such as authentication and realtime functionality (Supabase, n.d.). PostgreSQL itself is described by the PostgreSQL Global Development Group as a mature, open-source relational database with a strong reputation for reliability, feature robustness, and performance (PostgreSQL Global Development Group, n.d.). This pairing is appropriate for Jayd's Cafe because the data model of the system is strongly relational: users place orders, orders contain order items, items connect to categories and configurable options, payments affect order state, and loyalty balances must remain consistent with transaction outcomes.

Compared with document-oriented alternatives often discussed in generic full-stack literature, PostgreSQL is the better fit for this project because transactional correctness matters. Order creation, payment confirmation, inventory-related availability checks, and loyalty updates all benefit from relational constraints and dependable data integrity. Supabase adds further value by bundling authentication and realtime updates into the same backend environment, which supports the needs of a role-based ordering system more directly than a manually assembled backend stack would.

### Payment and PWA Enablement

The system uses Maya Checkout as its payment path for digital transactions. Maya documents describe Maya Checkout as a hosted payment solution that allows merchants to redirect customers to a secure checkout page while supporting multiple payment methods depending on account setup (Maya Developers, n.d.-a). Maya also documents webhook-based status handling as the recommended way to receive real-time transaction results and update merchant systems after payment events occur (Maya Developers, n.d.-b). This is relevant to Jayd's Cafe because payment confirmation must be tied to order-state changes in a dependable way. Instead of relying on manual proof-of-payment handling, the system can work with a formal payment flow that supports secure redirection and server-to-server event updates.

For PWA enablement, the customer application uses next-pwa. The official next-pwa package describes itself as a zero-configuration PWA plugin for Next.js that supports service-worker generation, precaching, runtime caching, and offline support (shadowwalker, n.d.). This choice supports the customer-side requirement for app-like browser behavior without forcing native application development. In combination with the broader PWA literature discussed earlier, next-pwa serves as the implementation tool that translates the concept of a mobile-friendly, installable web ordering experience into a working feature within the current system.

### System Architecture and Quality Standards

The implemented system follows a role-separated web architecture composed of three coordinated applications: a customer-facing PWA, a POS-facing transaction interface, and an admin-facing management interface, all connected to a shared Supabase backend. This architecture is appropriate because Jayd's Cafe does not have one homogeneous user group. Customers need fast ordering and status visibility; POS users need active-order and payment handling; administrators need control over menu, analytics, and records. Structuring the system around these role-specific interfaces avoids overloading a single interface with unrelated tasks and keeps the flow of responsibilities clear.

The quality standard for evaluation remains ISO/IEC 25010:2023, which defines the software product quality model used to assess functional suitability, performance, compatibility, interaction capability, reliability, security, maintainability, and flexibility (ISO, 2023). Sarker and Akter (2023) demonstrated the usefulness of ISO 25010 in evaluating e-commerce quality, while Lusiani and Princes (2024) showed its applicability in assessing mobile application effectiveness from a user-centered perspective. Compared with purely descriptive system evaluation, ISO 25010 offers a clearer and more defensible framework for assessing whether the Jayd's Cafe system performs adequately as both a customer-facing and operations-support tool.

## Synthesis

The reviewed literature and related systems converge on several points that strongly support the development of the proposed Jayd's Cafe system. First, PWA studies consistently show that browser-based applications can deliver app-like interaction, installability, and performance advantages without the distribution costs of native development. Second, ordering and queue literature shows that digital systems can improve efficiency not only by automating order capture but also by changing how customers experience waiting, convenience, and information quality. Third, loyalty research indicates that retention is not produced by rewards alone; it is shaped by reward visibility, timing, perceived fairness, and the overall satisfaction created by the ordering experience itself. Finally, local Philippine MSME literature confirms that digitalization is now a strategic necessity, but most small food businesses still rely on social media, marketplace channels, or other third-party solutions rather than tailored transactional systems.

At the same time, the review also reveals a meaningful research and implementation gap. Existing studies often focus on only one dimension of the problem. PWA studies are usually technology-centered. Food ordering studies often emphasize delivery platforms, customer satisfaction, or generic restaurant ordering. Loyalty studies explain retention mechanisms but are rarely situated in the operational realities of independent Philippine cafes. Local MSME literature, meanwhile, tends to focus on digital resilience, social media adoption, or general IT capability instead of lightweight first-party systems for in-store ordering and customer retention. Related commercial systems such as Toast, Square, Starbucks Rewards, GloriaFood, and Booky demonstrate that digital ordering and loyalty can be effective, but they are either enterprise-grade, platform-dependent, app-heavy, or externally controlled.

The proposed system addresses this gap by combining the literature's strongest insights into one role-based, browser-accessible solution. It uses a PWA approach to reduce app-distribution barriers, supports digital ordering and order monitoring to relieve physical queue pressure, incorporates customization for beverage-specific requests, and replaces physical stamp cards with digital loyalty and coupon support. Unlike marketplace-dependent tools, it is tailored to one local cafe and aligns directly with Jayd's Cafe's actual workflow. Unlike purely customer-facing food apps, it also includes POS and admin support so that operational visibility is part of the solution rather than an afterthought.

In summary, the proposed Jayd's Cafe system is supported by the literature but not duplicated by it. The reviewed works establish the value of PWAs, digital ordering, queue relief, loyalty mechanisms, and MSME digitalization; however, their combination into an ordering-centered PWA with integrated operational support for an independent Philippine cafe remains insufficiently addressed. That unfilled space justifies both the necessity and originality of the current project.

## References

Alcira, M. E. M., Co, B. M., Velasco, J. L. M., & Villanueva, S. A. G. (2022). Implications of digital transformation and digital resilience: An empirical study of the social media adoption of selected online food MSMEs during the COVID-19 pandemic in Metro Manila, Philippines. Animo Repository, De La Salle University. https://animorepository.dlsu.edu.ph/etdb_dsi/140/

Balba, N. P., Gomez, H. B., Nava, E. M., & Ramos, M. C. M. (2024). Exploring the digitalization of business models: A study on IT adoption in traditional industries. Asia Pacific Journal of Management and Sustainable Development, 12(3 Part 2). https://ejournals.ph/article.php?id=26166

Booky. (2023, February 23). From Booky Prime to BookyPay: Who is Booky now? https://booky.ph/blog/who-is-booky-now/

Buenaventura, R. U., Ignacio, A. E., & Laspona, J. A. S. (2021). Mobile ordering application for a generic fast food restaurant. International Journal of Multidisciplinary: Applied Business and Education Research, 2(5), 371-380. https://doi.org/10.11594/ijmaber.02.05.01

Cherukuri, B. R. (2024). Progressive web apps (PWAs): Enhancing user experience through modern web development. International Journal of Science and Research, 13(10), 1550-1560. https://doi.org/10.21275/MS241022095359

Dela Rosa, H. R., & Separa, L. A. (2022). Satisfactions of customers by using online food application services during Covid-19 pandemic. International Journal of Multidisciplinary: Applied Business and Education Research, 3(9). https://ejournals.ph/article.php?id=18362

Department of Trade and Industry. (2024). Micro, Small and Medium Enterprise (MSME) Development Plan 2023-2028. https://www.dti.gov.ph/sdm_downloads/msmed-plan-2023-2028

Fauzan, R., Krisnahati, I., Nurwibowo, B. D., & Wibowo, D. A. (2022). A systematic literature review on progressive web application practice and challenges. IPTEK The Journal for Technology and Science, 33(1), 43-58. https://doi.org/10.12962/j20882033.v33i1.13904

Gao, J., Long, S., Wu, M., Yang, Q., Al Mamun, A., & Hayat, N. (2024). Sustainable entrepreneurship through customer satisfaction and reuse intention of online food delivery applications: Insights from China. Journal of Innovation and Entrepreneurship, 13, Article 41. https://doi.org/10.1186/s13731-024-00399-z

GloriaFood. (n.d.). Online ordering system for restaurants. Retrieved April 26, 2026, from https://www.gloriafood.com/

ISO. (2023). ISO/IEC 25010:2023 systems and software engineering - Systems and software Quality Requirements and Evaluation (SQuaRE) - Product quality model (2nd ed.). International Organization for Standardization. https://www.iso.org/standard/78176.html

Jo, E. H., Chi, O. H., & Kim, J. (2025). How waiting decisions are made: A comparison of restaurant waiting equity and behavioral intentions in physical and virtual queues. Journal of Hospitality and Tourism Management, 63, 140-152. https://doi.org/10.1016/j.jhtm.2025.03.009

Li, J. (2024). Development of a web-based food ordering system. Asia Pacific Journal of Management and Sustainable Development, 12(2 Part 3). https://ejournals.ph/article.php?id=25951

Ko, W. L., & Song, T. H. (2025). Nonlinear reward gradient behavior in customer reward and loyalty programs: Evidence from the restaurant industry. Journal of Hospitality and Tourism Research, 49(4), 816-826. https://doi.org/10.1177/10963480231226083

Koay, K. Y., Cheah, C. W., & Chang, Y. X. (2022). A model of online food delivery service quality, customer satisfaction and customer loyalty: A combination of PLS-SEM and NCA approaches. British Food Journal, 124(12), 4516-4532. https://doi.org/10.1108/BFJ-10-2021-1169

Ladeira, W. J., Santini, F. O., Rasul, T., Ramkissoon, H., Nair, S., & Azhar, M. (2024). Stress and fresh-start mindsets promote repatronage intention in loyalty programs. Tourism Recreation Research, 50(3), 561-574. https://doi.org/10.1080/02508281.2023.2301270

Ladeira, W. J., Lim, W. M., Santini, F. O., Rasul, T., Rice, J. L., & Azhar, M. (2025). Fostering conative loyalty in tourism and hospitality loyalty programs: An eye-tracking experiment of reward timing, fairness perception, and visual attention. Tourism Recreation Research, 50(5), 1110-1126. https://doi.org/10.1080/02508281.2024.2369487

Lusiani, S., & Princes, E. (2024). Evaluating the effectiveness of mobile JKN application in Indonesia: A user-centric approach using the ISO 25010 quality model. Journal of Logistics, Informatics and Service Science, 11(10), 485-500. https://doi.org/10.33168/JLISS.2024.1028

Marchetto, T., & Morandini, M. (2024). User perceptions of progressive web app features: An analytical approach and a systematic literature review. In X. S. Yang, S. Sherratt, N. Dey, & A. Joshi (Eds.), Proceedings of Ninth International Congress on Information and Communication Technology (Vol. 1011, pp. 187-206). Springer. https://doi.org/10.1007/978-981-97-4581-4_14

Magsino, R. M. R., Matias, M. T. Y., Quizon, N. A., & Yap, F. R. P. (2021). Analysis on digital resilience and digital security readiness as factors of integrating digital transformation to selected food service casual-dining restaurants within Metro Manila. Animo Repository, De La Salle University. https://animorepository.dlsu.edu.ph/etdb_dsi/4/

Maya Developers. (n.d.-a). About Maya Checkout. Retrieved April 22, 2026, from https://developers.maya.ph/reference/checkout

Maya Developers. (n.d.-b). Configuring your webhook for Maya Checkout. Retrieved April 22, 2026, from https://developers.maya.ph/reference/configuring-your-webhook-for-maya-checkout

Microsoft. (n.d.). The TypeScript Handbook. Retrieved April 22, 2026, from https://www.typescriptlang.org/docs/handbook/intro

Muawwal, A. (2024). The implementation of PWA (progressive web app) technology in enhancing website performance and mobile accessibility. Buletin Pos dan Telekomunikasi, 22(1), 43-56. https://doi.org/10.17933/bpostel.v22i1.395

Next.js. (2024). App Router. https://nextjs.org/docs/14/app

Olazo, D. B. (2023). An exploratory sequential approach to building dynamic capabilities for digital transformation on selected MSMEs in Pampanga, Philippines [Doctoral dissertation, De La Salle University]. Animo Repository. https://animorepository.dlsu.edu.ph/etdd_dsi/9/

Philippine News Agency. (2023, July 10). DTI launches Philippine E-Commerce Platform, digitalizes OTOP. https://www.pna.gov.ph/articles/1205342

PostgreSQL Global Development Group. (n.d.). PostgreSQL: The world's most advanced open source relational database. Retrieved April 22, 2026, from https://www.postgresql.org/

React. (n.d.). React. Retrieved April 22, 2026, from https://react.dev/

Sarker, M. M. H., & Akter, S. (2023). Insights into B2C e-commerce quality using ISO 25010. Journal of Software Engineering and Applications, 16(8), 396-414. https://doi.org/10.4236/jsea.2023.168021

shadowwalker. (n.d.). next-pwa. Retrieved April 22, 2026, from https://www.npmjs.com/package/next-pwa

Square. (n.d.-a). Online ordering system for restaurants. Retrieved April 26, 2026, from https://squareup.com/us/en/online-store/restaurants/delivery

Square. (n.d.-b). QR code ordering for restaurants. Retrieved April 26, 2026, from https://squareup.com/us/en/online-ordering/qr-code-ordering

Starbucks Coffee Company. (n.d.). Starbucks Rewards program. Retrieved April 26, 2026, from https://www.starbucks.com/rewards/

Supabase. (n.d.). Database. Retrieved April 22, 2026, from https://supabase.com/docs/guides/database/overview

Tan, M. J. C., & Pilar, J. G. (2024). Factors affecting the online food delivery services in the City of Mati: A factor analysis. International Journal For Multidisciplinary Research, 6(3). https://doi.org/10.36948/ijfmr.2024.v06i03.22458

Thomas, A. J., & Kumar, S. R. (2024). A study on progressive web apps: Revolutionizing user experiences and redefining web applications. ShodhKosh: Journal of Visual and Performing Arts, 5(6), 3464-3472. https://doi.org/10.29121/shodhkosh.v5.i6.2024.5977

Toast. (n.d.). Restaurant online ordering system. Retrieved April 26, 2026, from https://pos.toasttab.com/products/online-ordering/

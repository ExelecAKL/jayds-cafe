from __future__ import annotations

from datetime import datetime, timezone
import shutil
import re
import textwrap
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
SOURCE = DOCS / "Chapter 3 MDs" / "chapter3_tables_draft.md"
FINAL_SOURCE = DOCS / "Chapter 3 MDs" / "chapter3_final_draft.md"
UPDATED = ROOT / "updated dfd+context"
SCREENSHOTS = ROOT / "screenshots"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf") if bold else Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf") if bold else Path("C:/Windows/Fonts/calibri.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf") if bold else Path("C:/Windows/Fonts/segoeui.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


FONT_TITLE = font(42, True)
FONT_SUBTITLE = font(25, True)
FONT_BODY = font(22)
FONT_SMALL = font(18)
FONT_TINY = font(15)


def copy_updated_diagrams() -> None:
    mapping = {
        "cafeos_context_diagram.drawio (1).png": "chapter3_context_diagram_final.png",
        "cafeos_dfd_customer_perspective.drawio (1).png": "chapter3_dfd_customer_perspective_final.png",
        "cafeos_dfd_staff_pos_perspective.drawio.png": "chapter3_dfd_staff_perspective_final.png",
        "cafeos_dfd_admin_perspective.drawio (1).png": "chapter3_dfd_admin_perspective_final.png",
    }
    for src_name, dst_name in mapping.items():
        shutil.copy2(UPDATED / src_name, DOCS / dst_name)


def draw_wrapped_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    max_width: int,
    text_font: ImageFont.ImageFont,
    fill: str = "#111111",
    line_gap: int = 6,
) -> int:
    x, y = xy
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        current = ""
        for word in words:
            attempt = f"{current} {word}".strip()
            if draw.textbbox((0, 0), attempt, font=text_font)[2] <= max_width:
                current = attempt
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    for line in lines:
        draw.text((x, y), line, font=text_font, fill=fill)
        y += draw.textbbox((0, 0), line, font=text_font)[3] + line_gap
    return y


def rounded_box(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    lines: list[str],
    fill: str = "#ffffff",
    outline: str = "#111111",
    title_fill: str = "#0b5f5a",
) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=24, fill=fill, outline=outline, width=3)
    title_bottom = draw_wrapped_text(draw, (x1 + 24, y1 + 22), title, x2 - x1 - 48, FONT_SUBTITLE, title_fill, 5)
    y = title_bottom + 8
    for line in lines:
        y = draw_wrapped_text(draw, (x1 + 24, y), line, x2 - x1 - 48, FONT_BODY, "#111111", 7) + 2


def arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    label: str | None = None,
    label_offset: tuple[int, int] = (0, -30),
    color: str = "#111111",
) -> None:
    draw.line([start, end], fill=color, width=4)
    sx, sy = start
    ex, ey = end
    if abs(ex - sx) >= abs(ey - sy):
        direction = 1 if ex >= sx else -1
        head = [(ex, ey), (ex - 18 * direction, ey - 10), (ex - 18 * direction, ey + 10)]
    else:
        direction = 1 if ey >= sy else -1
        head = [(ex, ey), (ex - 10, ey - 18 * direction), (ex + 10, ey - 18 * direction)]
    draw.polygon(head, fill=color)
    if label:
        mx = (sx + ex) // 2 + label_offset[0]
        my = (sy + ey) // 2 + label_offset[1]
        bbox = draw.textbbox((0, 0), label, font=FONT_SMALL)
        pad = 8
        draw.rounded_rectangle(
            (mx - pad, my - pad, mx + bbox[2] + pad, my + bbox[3] + pad),
            radius=8,
            fill="#ffffff",
            outline="#ffffff",
        )
        draw.text((mx, my), label, font=FONT_SMALL, fill=color)


def create_deployment_diagram() -> None:
    img = Image.new("RGB", (1900, 1120), "#ffffff")
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, 1900, 1120), fill="#ffffff")
    italic = font(34)
    draw.text((55, 40), "Deployment Diagram", font=italic, fill="#111111")

    def node_box(x: int, y: int, w: int, h: int, header: str, title: str, component: str | None = None) -> None:
        depth = 22
        front = (x, y + depth, x + w, y + h + depth)
        top = [(x, y + depth), (x + depth, y), (x + w + depth, y), (x + w, y + depth)]
        side = [(x + w, y + depth), (x + w + depth, y), (x + w + depth, y + h), (x + w, y + h + depth)]
        draw.polygon(top, fill="#ffffff", outline="#111111")
        draw.polygon(side, fill="#f5f5f5", outline="#111111")
        draw.rectangle(front, fill="#ffffff", outline="#111111", width=3)
        draw.text((x + w // 2, y + 65), header, font=FONT_SMALL, fill="#111111", anchor="mm")
        draw.multiline_text((x + w // 2, y + 105), title, font=FONT_SUBTITLE, fill="#111111", anchor="mm", align="center", spacing=3)
        if component:
            cx1, cy1 = x + 58, y + h - 76
            cx2, cy2 = x + w - 58, y + h + 2
            draw.rectangle((cx1, cy1, cx2, cy2), fill="#ffffff", outline="#111111", width=2)
            draw.multiline_text((x + w // 2, cy1 + 39), component, font=FONT_SMALL, fill="#111111", anchor="mm", align="center", spacing=3)

    def plain_arrow(start: tuple[int, int], end: tuple[int, int], label: str, dashed: bool = False) -> None:
        color = "#111111"
        if dashed:
            sx, sy = start
            ex, ey = end
            steps = 28
            for i in range(0, steps, 2):
                a = i / steps
                b = (i + 1) / steps
                draw.line((sx + (ex - sx) * a, sy + (ey - sy) * a, sx + (ex - sx) * b, sy + (ey - sy) * b), fill=color, width=3)
        else:
            draw.line((start, end), fill=color, width=3)
        sx, sy = start
        ex, ey = end
        direction = 1 if ex >= sx else -1
        if abs(ex - sx) >= abs(ey - sy):
            head = [(ex, ey), (ex - 18 * direction, ey - 10), (ex - 18 * direction, ey + 10)]
        else:
            vdir = 1 if ey >= sy else -1
            head = [(ex, ey), (ex - 10, ey - 18 * vdir), (ex + 10, ey - 18 * vdir)]
        draw.polygon(head, fill=color)
        mx, my = (sx + ex) // 2, (sy + ey) // 2
        bbox = draw.multiline_textbbox((0, 0), label, font=FONT_SMALL, spacing=2)
        draw.rectangle((mx - bbox[2] // 2 - 8, my - bbox[3] - 18, mx + bbox[2] // 2 + 8, my + 10), fill="#ffffff")
        draw.multiline_text((mx, my - bbox[3] - 8), label, font=FONT_SMALL, fill=color, anchor="ma", align="center", spacing=2)

    node_box(70, 150, 360, 245, "<<node>>", "Client Devices\n(Mobile / POS / Admin)", "<<Front-End>>\nNext.js PWA / Web Apps")
    node_box(650, 170, 360, 225, "<<node>>", "Web Server\n(Cloud Hosted)", "<<Back-End>>\nVercel + Next.js API")
    node_box(1310, 185, 360, 170, "<<SaaS>>", "Supabase\nAuth-as-a-Service", None)
    node_box(585, 630, 520, 245, "<<Database Node>>", "Supabase PostgreSQL\nDatabase Server\n(Cloud Deployment)", None)
    node_box(1310, 640, 360, 190, "<<External Services>>", "Maya Payment API\nLalamove Delivery API", None)

    plain_arrow((430, 282), (650, 282), "HTTPS\n(REST API, JSON)")
    plain_arrow((1010, 282), (1310, 282), "API Call\n(SDK)")
    plain_arrow((830, 395), (830, 630), "PostgREST / SQL\n(via SSL)")
    plain_arrow((1010, 365), (1310, 700), "HTTPS API\n(Serverless)")
    plain_arrow((230, 150), (1490, 185), "Auth redirect / session", dashed=True)

    img.save(DOCS / "chapter3_deployment_diagram.png")
    create_deployment_drawio()


def create_deployment_drawio() -> None:
    drawio_dir = DOCS / "drawio_exports"
    drawio_dir.mkdir(parents=True, exist_ok=True)
    mxfile = ET.Element(
        "mxfile",
        {
            "host": "app.diagrams.net",
            "modified": datetime.now(timezone.utc).isoformat(),
            "agent": "Codex",
            "version": "24.7.17",
            "type": "device",
        },
    )
    diagram = ET.SubElement(mxfile, "diagram", {"id": "deployment-diagram", "name": "CafeOS Deployment Diagram"})
    model = ET.SubElement(
        diagram,
        "mxGraphModel",
        {
            "dx": "1800",
            "dy": "1100",
            "grid": "1",
            "gridSize": "10",
            "guides": "1",
            "tooltips": "1",
            "connect": "1",
            "arrows": "1",
            "fold": "1",
            "page": "1",
            "pageScale": "1",
            "pageWidth": "1900",
            "pageHeight": "1120",
            "math": "0",
            "shadow": "0",
            "background": "#ffffff",
        },
    )
    root = ET.SubElement(model, "root")
    ET.SubElement(root, "mxCell", {"id": "0"})
    ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})

    def vertex(cell_id: str, value: str, x: int, y: int, w: int, h: int, style: str) -> None:
        cell = ET.SubElement(root, "mxCell", {"id": cell_id, "value": value, "style": style, "vertex": "1", "parent": "1"})
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"})

    def edge(cell_id: str, source: str, target: str, value: str, dashed: bool = False) -> None:
        style = "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;endFill=1;strokeColor=#111111;strokeWidth=2;"
        if dashed:
            style += "dashed=1;"
        cell = ET.SubElement(root, "mxCell", {"id": cell_id, "value": value, "style": style, "edge": "1", "parent": "1", "source": source, "target": target})
        ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})

    title_style = "text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;fontFamily=Arial;fontSize=24;fontStyle=2;align=left;"
    node_style = "shape=cube;size=20;whiteSpace=wrap;html=1;boundedLbl=1;strokeColor=#111111;fillColor=#ffffff;fontFamily=Arial;fontSize=16;fontStyle=1;align=center;verticalAlign=middle;"
    component_style = "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;fillColor=#ffffff;fontFamily=Arial;fontSize=13;fontStyle=1;align=center;verticalAlign=middle;"
    vertex("title", "Deployment Diagram", 45, 40, 360, 40, title_style)
    vertex("client", "&lt;&lt;node&gt;&gt;<br><b>Client Devices<br>(Mobile / POS / Admin)</b>", 70, 150, 360, 245, node_style)
    vertex("client_component", "&lt;&lt;Front-End&gt;&gt;<br><b>Next.js PWA / Web Apps</b>", 130, 292, 240, 70, component_style)
    vertex("web", "&lt;&lt;node&gt;&gt;<br><b>Web Server<br>(Cloud Hosted)</b>", 650, 170, 360, 225, node_style)
    vertex("web_component", "&lt;&lt;Back-End&gt;&gt;<br><b>Vercel + Next.js API</b>", 710, 292, 240, 70, component_style)
    vertex("auth", "&lt;&lt;SaaS&gt;&gt;<br><b>Supabase<br>Auth-as-a-Service</b>", 1310, 185, 360, 170, node_style)
    vertex("db", "&lt;&lt;Database Node&gt;&gt;<br><b>Supabase PostgreSQL<br>Database Server<br>(Cloud Deployment)</b>", 585, 630, 520, 245, node_style)
    vertex("external", "&lt;&lt;External Services&gt;&gt;<br><b>Maya Payment API<br>Lalamove Delivery API</b>", 1310, 640, 360, 190, node_style)
    edge("e1", "client", "web", "HTTPS<br>(REST API, JSON)")
    edge("e2", "web", "auth", "API Call<br>(SDK)")
    edge("e3", "web", "db", "PostgREST / SQL<br>(via SSL)")
    edge("e4", "web", "external", "HTTPS API<br>(Serverless)")
    edge("e5", "client", "auth", "Auth redirect / session", dashed=True)

    tree = ET.ElementTree(mxfile)
    ET.indent(tree, space="  ")
    tree.write(drawio_dir / "cafeos_deployment_diagram.drawio", encoding="utf-8", xml_declaration=True)


def cover_fit(source: Image.Image, width: int, height: int) -> Image.Image:
    source = source.convert("RGB")
    scale = max(width / source.width, height / source.height)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - width) // 2)
    top = max(0, (resized.height - height) // 2)
    return resized.crop((left, top, left + width, top + height))


def make_contact_sheet(items: list[tuple[str, str]], output: str, title: str, columns: int, thumb: tuple[int, int]) -> None:
    rows = (len(items) + columns - 1) // columns
    margin = 42
    gap = 32
    label_h = 44
    title_h = 90
    w = margin * 2 + columns * thumb[0] + (columns - 1) * gap
    h = margin * 2 + title_h + rows * (thumb[1] + label_h) + (rows - 1) * gap
    sheet = Image.new("RGB", (w, h), "#ffffff")
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, margin), title, font=FONT_TITLE, fill="#111111")
    y0 = margin + title_h
    for idx, (filename, label) in enumerate(items):
        row = idx // columns
        col = idx % columns
        x = margin + col * (thumb[0] + gap)
        y = y0 + row * (thumb[1] + label_h + gap)
        with Image.open(SCREENSHOTS / filename) as im:
            fitted = cover_fit(im, *thumb)
        draw.rounded_rectangle((x - 8, y - 8, x + thumb[0] + 8, y + thumb[1] + 8), radius=14, outline="#a0a0a0", width=2, fill="#f7f7f7")
        sheet.paste(fitted, (x, y))
        label_text = "\n".join(textwrap.wrap(label, 26))
        bbox = draw.multiline_textbbox((0, 0), label_text, font=FONT_SMALL, spacing=2)
        draw.multiline_text((x + (thumb[0] - bbox[2]) // 2, y + thumb[1] + 12), label_text, font=FONT_SMALL, fill="#111111", spacing=2, align="center")
    sheet.save(DOCS / output)


def create_screenshot_plates() -> None:
    customer_1 = [
        ("welcome logo.png", "Welcome"),
        ("loading banner.png", "Loading Banner"),
        ("signup customer.png", "Customer Sign Up"),
        ("login customer.png", "Customer Login"),
        ("home.png", "Customer Home"),
        ("menu.png", "Menu Browse"),
        ("item.png", "Item Details"),
        ("cart.png", "Cart"),
    ]
    customer_2 = [
        ("checkout.png", "Checkout"),
        ("confirm order.png", "Confirm Order"),
        ("orders.png", "Order List"),
        ("order details.png", "Order Details"),
        ("account.png", "Account QR"),
        ("edit profile.png", "Edit Profile"),
        ("loyalty.png", "Loyalty Points"),
        ("voucher.png", "Vouchers"),
        ("saved address.png", "Saved Address"),
    ]
    pos = [
        ("login pos.png", "POS Login"),
        ("order dashboard.png", "Order Dashboard"),
        ("pos order menu.png", "POS Order Menu"),
        ("poskds.png", "Kitchen Display"),
    ]
    admin_1 = [
        ("admin login.png", "Admin Login"),
        ("admin dashboard.png", "Admin Dashboard"),
        ("admin orders.png", "Orders"),
        ("admin order details.png", "Order Details"),
        ("admin menu items.png", "Menu Items"),
        ("admin menu form.png", "Menu Form"),
    ]
    admin_2 = [
        ("admin categories.png", "Categories"),
        ("admin category options.png", "Category Options"),
        ("admin inventory.png", "Inventory"),
        ("admin iventory material form.png", "Inventory Material Form"),
        ("admin voucher.png", "Voucher Management"),
        ("admin users loyalty.png", "User Loyalty"),
        ("admin staff.png", "Staff Management"),
        ("admin analytics.png", "Analytics"),
        ("admin void.png", "Void Authorization"),
    ]
    make_contact_sheet(customer_1, "chapter3_customer_screens_part1.png", "Customer Application Screen Designs - Part 1", 4, (270, 585))
    make_contact_sheet(customer_2, "chapter3_customer_screens_part2.png", "Customer Application Screen Designs - Part 2", 5, (220, 476))
    make_contact_sheet(pos, "chapter3_pos_screens.png", "Staff/POS Application Screen Designs", 2, (720, 370))
    make_contact_sheet(admin_1, "chapter3_admin_screens_part1.png", "Admin Application Screen Designs - Part 1", 2, (720, 370))
    make_contact_sheet(admin_2, "chapter3_admin_screens_part2.png", "Admin Application Screen Designs - Part 2", 3, (470, 245))


def rewrite_markdown() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    text = text.replace("../chapter3_context_diagram.png", "../chapter3_context_diagram_final.png")
    text = text.replace("../chapter3_dfd_customer_perspective.png", "../chapter3_dfd_customer_perspective_final.png")
    text = text.replace("../chapter3_dfd_staff_perspective.png", "../chapter3_dfd_staff_perspective_final.png")
    text = text.replace("../chapter3_dfd_admin_perspective.png", "../chapter3_dfd_admin_perspective_final.png")

    before_system_design, _, system_design = text.partition("## System Design")
    system_design_intro, _, after_intro = system_design.partition("### System Architecture")
    architecture_body, _, after_architecture = after_intro.partition("### Entity Relationship Diagrams")
    erd_body, _, after_erd = after_architecture.partition("Table 2\nData Dictionary")
    data_dictionary_body, _, after_data_dictionary = after_erd.partition("Table 3\nSoftware Specification")

    screenshot_items = [
        ("signup customer.png", "Customer Registration Form"),
        ("login customer.png", "Customer Login Form"),
        ("checkout.png", "Customer Checkout Form"),
        ("confirm order.png", "Customer Order Confirmation Form"),
        ("orders.png", "Customer Orders Report"),
        ("order details.png", "Customer Order Details Report"),
        ("account.png", "Customer Account QR Form"),
        ("edit profile.png", "Customer Edit Profile Form"),
        ("loyalty.png", "Customer Loyalty Report"),
        ("voucher.png", "Customer Voucher Report"),
        ("saved address.png", "Customer Saved Address Form"),
        ("login pos.png", "Staff/POS Login Form"),
        ("order dashboard.png", "Staff/POS Order Dashboard Report"),
        ("pos order menu.png", "Staff/POS Order Menu Form"),
        ("poskds.png", "Kitchen Display System Report"),
        ("admin login.png", "Admin Login Form"),
        ("admin dashboard.png", "Admin Dashboard Report"),
        ("admin orders.png", "Admin Orders Report"),
        ("admin order details.png", "Admin Order Details Report"),
        ("admin menu items.png", "Admin Menu Items Report"),
        ("admin menu form.png", "Admin Menu Item Form"),
        ("admin categories.png", "Admin Categories Report"),
        ("admin category options.png", "Admin Category Options Form"),
        ("admin inventory.png", "Admin Inventory Report"),
        ("admin iventory material form.png", "Admin Inventory Material Form"),
        ("admin voucher.png", "Admin Voucher Management Report"),
        ("admin users loyalty.png", "Admin User Loyalty Report"),
        ("admin staff.png", "Admin Staff Management Report"),
        ("admin analytics.png", "Admin Analytics Report"),
        ("analytics overview.png", "Admin Analytics Overview Report"),
        ("revenue over time.png", "Admin Revenue Over Time Report"),
        ("best sellers.png", "Admin Best Sellers Report"),
        ("sales breakdown.png", "Admin Sales Breakdown Report"),
        ("peak hours heatmap.png", "Admin Peak Hours Heatmap Report"),
        ("profit margin per item.png", "Admin Profit Margin Per Item Report"),
        ("admin void.png", "Admin Void Authorization Form"),
    ]

    forms_block_lines = [
        "### Forms and Reports",
        "",
    ]
    for figure_number, (filename, title) in enumerate(screenshot_items, start=11):
        forms_block_lines.extend(
            [
                f"Figure {figure_number}",
                title,
                "",
                f"![{title}](../../screenshots/{filename})",
                "",
            ]
        )
    forms_block_lines.extend(
        [
            f"Figures 11 through {10 + len(screenshot_items)} illustrate the main forms and reports of the proposed CafeOS system. These figures focus only on the screens that capture user input or present organized system records. The customer-side figures include registration, login, checkout, order confirmation, order records, account QR, profile, loyalty, voucher, and saved-address forms or reports. The staff and POS figures show branch login, order monitoring, POS order creation, and kitchen display reporting. The admin figures show management reports and maintenance forms for orders, menu items, categories, inventory, vouchers, loyalty users, staff accounts, analytics, sales summaries, peak-hour heatmaps, item profitability, and void authorization. Together, these forms and reports present the core input and output interfaces used by the three primary user groups of the system.",
            "",
        ]
    )
    forms_block = "\n".join(forms_block_lines)

    erd_start = 11 + len(screenshot_items)
    arch_start = erd_start + 7
    deployment_number = arch_start + 2

    def renumber_erd(match: re.Match[str]) -> str:
        number = int(match.group(1))
        return f"Figure {number + erd_start - 13}" if 13 <= number <= 19 else match.group(0)

    erd_block = "### Entity Relationship Diagrams" + re.sub(r"Figure (1[3-9])", renumber_erd, erd_body)

    def renumber_architecture(match: re.Match[str]) -> str:
        number = int(match.group(1))
        mapping = {11: arch_start, 12: arch_start + 1}
        return f"Figure {mapping[number]}" if number in mapping else match.group(0)

    architecture_block = "### System Architecture" + re.sub(r"Figure (1[12])", renumber_architecture, architecture_body)
    deployment_block = f"""Figure {deployment_number}
Deployment Diagram of the Proposed CafeOS System

![Deployment Diagram of the Proposed CafeOS System](../chapter3_deployment_diagram.png)

Figure {deployment_number} presents the deployment diagram of the proposed CafeOS system. The diagram shows the Customer mobile device, branch POS terminal, and Admin workstation accessing the CafeOS applications through web browsers over HTTPS. The applications are deployed as separate Vercel projects connected to the same monorepo, while serverless API routes handle secured backend operations that should not run directly on the client side.

The diagram also shows Supabase as the main backend cloud service for authentication, PostgreSQL database storage, row-level security, and realtime updates. Maya and Lalamove are represented as external services accessed through server-side API routes for payment checkout, payment confirmation, delivery quotation, booking, and rider status. This deployment structure supports the branch-based POS workflow, online customer ordering, centralized administration, and third-party service integration while keeping sensitive credentials and backend operations outside the browser.

"""

    testing_block = """## Test Plan

To evaluate the proposed CafeOS system, the researchers will conduct a structured test plan covering the major quality assurance activities needed for the Customer PWA, POS application, Admin dashboard, shared Supabase backend, and third-party service integrations. Unit testing will verify individual functions and components such as form validation, order total computation, loyalty point deduction, voucher checking, QR token handling, and role-based route guards. Integration testing will confirm that connected modules exchange data correctly, including customer checkout to POS order queue, POS order updates to customer order status, Admin menu updates to customer menu display, inventory-related records to admin reports, and server-side API routes to Maya and Lalamove.

Functional testing will validate that the main features of the system operate according to the requirements identified by the researchers. These features include customer registration and login, menu browsing, cart and checkout, Maya payment confirmation QR, account QR scanning for points, pickup QR confirmation, advance pickup order limits, Lalamove delivery booking, POS order processing, kitchen display monitoring, admin menu and inventory management, voucher and loyalty management, analytics, reports, and void authorization. Security testing will be performed to check authentication, row-level security, staff access restrictions, admin-only operations, QR expiration behavior, and protection of sensitive API credentials. Performance and load testing will check whether the system remains responsive when several customers, POS users, and administrators access ordering and reporting functions at the same time.

System testing will evaluate the complete CafeOS workflow as one integrated system, while user acceptance testing will be conducted with representative users from the customer, staff/POS, and admin perspectives. The researchers will also review the deployment environment, browser compatibility, network stability, database connectivity, and external service behavior to confirm that the system can support both online ordering and branch-based operations.

## System Testing Procedure

The system testing procedure will begin with preparation of the testing environment, including the Customer PWA, POS application, Admin dashboard, Supabase database, authentication rules, seed records, and configured API credentials for payment and delivery testing. The researchers will first perform unit testing by checking individual forms, validation rules, computation logic, QR generation and scanning behavior, role checks, and reusable utility functions. Each component will be tested separately before being connected to the rest of the system.

After unit testing, integration testing will be performed by executing connected workflows across modules. The researchers will create customer pickup and delivery orders, verify that the records appear in the POS dashboard and KDS, update order statuses, check that customers receive the correct order status and receipt information, and confirm that admin reports reflect the transactions. Payment-related tests will include generating Maya checkout links, validating payment confirmation QR behavior, and confirming that unpaid, paid, and expired states are handled correctly. Delivery-related tests will include Lalamove quotation, booking request handling, rider status storage, and network-error handling.

Functional testing will be conducted by simulating real user tasks for each role. Customers will be tested through account creation, login, menu browsing, voucher and point usage, QR presentation, checkout, pickup, delivery, and order history. Staff/POS users will be tested through scanning account and pickup QR codes, creating branch orders, confirming payments, updating order stages, using the KDS, and voiding orders with authorization. Administrators will be tested through menu maintenance, category options, inventory records, voucher and loyalty settings, staff management, analytics review, and audit-related reports.

Security, reliability, and performance checks will then be performed. The researchers will test unauthorized page access, invalid QR tokens, expired payment confirmation links, role-restricted actions, and protected server-side operations. Reliability testing will check recovery from failed API calls, network interruptions, duplicate submissions, and invalid order states. Performance testing will simulate multiple ordering and dashboard activities to observe response time and realtime update behavior. Finally, the complete system will be evaluated through end-to-end testing and user acceptance testing, where representative users will perform actual workflows and provide feedback before final revisions.

## System Evaluation Procedure

The proposed CafeOS system will be evaluated using the ISO/IEC 25010 software quality model as a guide for measuring whether the system meets its intended purpose. The evaluation will focus on functional suitability, performance efficiency, compatibility, usability, reliability, security, maintainability, and portability. These characteristics are appropriate for CafeOS because the system must support online customer ordering, branch-based POS activity, administrative monitoring, secure account handling, realtime order updates, payment confirmation, delivery integration, and loyalty-related operations.

For functional suitability, the system will be evaluated based on whether the implemented modules completely support the required ordering, payment, pickup, delivery, loyalty, inventory, and reporting functions. Functional correctness will be checked by comparing computed totals, loyalty deductions, voucher discounts, payment states, delivery states, and order status transitions with the expected results. For usability, respondents will evaluate whether the customer, POS, and admin interfaces are understandable, easy to navigate, and appropriate for their intended users. Error prevention will also be considered through confirmation dialogs, validation messages, QR expiration handling, and restrictions on invalid order actions.

For reliability, the system will be evaluated according to its ability to maintain consistent records and recover from failed network requests, duplicate actions, external API errors, and interrupted user sessions. For security, the evaluation will consider authentication, authorization, row-level security, admin-only controls, staff permissions, audit logs, QR token behavior, and protection of sensitive integration credentials. For performance efficiency, the researchers will observe loading time, order submission response, dashboard updates, report generation, and concurrent usage behavior. For maintainability and portability, the evaluation will consider the modular structure of the monorepo, reusable components, typed code, cloud-based deployment, and browser-based access across supported devices.

The respondents will rate the system using the numerical scale presented in Table 7. The gathered results will be interpreted using the corresponding verbal descriptions and will be used to determine whether CafeOS satisfies the operational needs of Jayd's Cafe. The evaluation findings will also guide final revisions before the system is presented for assessment.

"""

    after_data_dictionary = after_data_dictionary.replace(
        "\n## Standard Numerical Scale for System Evaluation\n",
        "\n" + testing_block + "## Standard Numerical Scale for System Evaluation\n",
        1,
    )

    final_text = (
        before_system_design
        + "## System Design"
        + system_design_intro
        + forms_block
        + erd_block
        + "Table 2\nData Dictionary"
        + data_dictionary_body
        + architecture_block
        + deployment_block
        + "Table 3\nSoftware Specification"
        + after_data_dictionary
    )
    FINAL_SOURCE.write_text(final_text, encoding="utf-8")


def main() -> None:
    copy_updated_diagrams()
    create_deployment_diagram()
    rewrite_markdown()
    print(f"WROTE={FINAL_SOURCE}")


if __name__ == "__main__":
    main()

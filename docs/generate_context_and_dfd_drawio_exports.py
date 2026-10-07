from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET


OUTPUT_DIR = Path(__file__).parent / "drawio_exports"

PAGE_STYLE = {
    "dx": "1800",
    "dy": "1200",
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
    "pageHeight": "1350",
    "math": "0",
    "shadow": "0",
    "background": "#ffffff",
}

BASE_FONT = "fontFamily=Arial;fontSize=15;"
ENTITY_STYLE = (
    "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;fillColor=#ffffff;"
    "fontStyle=1;fontFamily=Arial;fontSize=18;align=center;verticalAlign=middle;"
)
PROCESS_STYLE = (
    "rounded=1;whiteSpace=wrap;html=1;strokeColor=#111111;fillColor=#ffffff;"
    "arcSize=20;fontFamily=Arial;fontSize=18;align=center;verticalAlign=middle;"
)
SYSTEM_STYLE = (
    "ellipse;whiteSpace=wrap;html=1;strokeColor=#111111;fillColor=#ffffff;"
    "fontStyle=1;fontFamily=Arial;fontSize=21;align=center;verticalAlign=middle;"
)
STORE_STYLE = (
    "rounded=0;whiteSpace=wrap;html=1;strokeColor=#111111;fillColor=#ffffff;"
    "fontFamily=Arial;fontSize=15;align=center;verticalAlign=middle;"
)
EDGE_STYLE = (
    "edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;"
    "html=1;endArrow=block;endFill=1;strokeColor=#111111;strokeWidth=1;"
)
TEXT_STYLE = (
    "text;html=1;strokeColor=none;fillColor=none;whiteSpace=wrap;"
    "align=center;verticalAlign=middle;fontStyle=1;fontFamily=Arial;fontSize=13;fontColor=#111111;"
)
BACKGROUND_STYLE = "rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=none;locked=1;"


class DrawioBuilder:
    def __init__(self, name: str, width: int, height: int) -> None:
        self.name = name
        self.width = width
        self.height = height
        self.counter = 2
        self.mxfile = ET.Element(
            "mxfile",
            {
                "host": "app.diagrams.net",
                "modified": datetime.now(timezone.utc).isoformat(),
                "agent": "Codex",
                "version": "24.7.17",
                "type": "device",
            },
        )
        self.diagram = ET.SubElement(self.mxfile, "diagram", {"id": self._next_id(), "name": name})
        attrs = PAGE_STYLE | {"pageWidth": str(width), "pageHeight": str(height)}
        self.model = ET.SubElement(self.diagram, "mxGraphModel", attrs)
        self.root = ET.SubElement(self.model, "root")
        ET.SubElement(self.root, "mxCell", {"id": "0"})
        ET.SubElement(self.root, "mxCell", {"id": "1", "parent": "0"})
        self.vertex("", 0, 0, width, height, BACKGROUND_STYLE, "background")

    def _next_id(self) -> str:
        value = f"cell-{self.counter}"
        self.counter += 1
        return value

    def vertex(self, value: str, x: int, y: int, w: int, h: int, style: str, cell_id: str | None = None) -> str:
        cell_id = cell_id or self._next_id()
        cell = ET.SubElement(
            self.root,
            "mxCell",
            {"id": cell_id, "value": value, "style": style, "vertex": "1", "parent": "1"},
        )
        ET.SubElement(cell, "mxGeometry", {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "as": "geometry"})
        return cell_id

    def label(self, value: str, x: int, y: int, w: int = 230, h: int = 36) -> str:
        return self.vertex(value, x, y, w, h, TEXT_STYLE)

    def edge(
        self,
        source: str,
        target: str,
        points: list[tuple[int, int]] | None = None,
        value: str = "",
        style: str = EDGE_STYLE,
    ) -> str:
        cell_id = self._next_id()
        cell = ET.SubElement(
            self.root,
            "mxCell",
            {"id": cell_id, "value": value, "style": style, "edge": "1", "parent": "1", "source": source, "target": target},
        )
        geom = ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})
        if points:
            arr = ET.SubElement(geom, "Array", {"as": "points"})
            for x, y in points:
                ET.SubElement(arr, "mxPoint", {"x": str(x), "y": str(y)})
        return cell_id

    def edge_abs(
        self,
        start: tuple[int, int],
        end: tuple[int, int],
        points: list[tuple[int, int]] | None = None,
        value: str = "",
        style: str = EDGE_STYLE,
    ) -> str:
        cell_id = self._next_id()
        cell = ET.SubElement(
            self.root,
            "mxCell",
            {"id": cell_id, "value": value, "style": style, "edge": "1", "parent": "1"},
        )
        geom = ET.SubElement(cell, "mxGeometry", {"relative": "1", "as": "geometry"})
        ET.SubElement(geom, "mxPoint", {"x": str(start[0]), "y": str(start[1]), "as": "sourcePoint"})
        ET.SubElement(geom, "mxPoint", {"x": str(end[0]), "y": str(end[1]), "as": "targetPoint"})
        if points:
            arr = ET.SubElement(geom, "Array", {"as": "points"})
            for x, y in points:
                ET.SubElement(arr, "mxPoint", {"x": str(x), "y": str(y)})
        return cell_id

    def save(self, path: Path) -> None:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        tree = ET.ElementTree(self.mxfile)
        ET.indent(tree, space="  ")
        tree.write(path, encoding="utf-8", xml_declaration=True)


def process_label(number: str, title: str) -> str:
    return f"<b>{number}</b><br><hr>{title}"


def store_label(store_id: str, name: str) -> str:
    return f"<b>{store_id}</b>&nbsp;&nbsp;&nbsp;&nbsp;{name}"


def build_context_diagram() -> Path:
    b = DrawioBuilder("CafeOS Context Diagram", 1900, 1350)

    b.vertex("CUSTOMER", 20, 70, 340, 160, ENTITY_STYLE, "customer")
    b.vertex("STAFF / POS", 20, 1070, 340, 160, ENTITY_STYLE, "staff")
    b.vertex("ADMIN", 1540, 70, 340, 160, ENTITY_STYLE, "admin")
    b.vertex("EXTERNAL SERVICES<br>(Maya / Lalamove)", 1540, 1070, 340, 160, ENTITY_STYLE, "external")
    b.vertex("0<br><br>CafeOS Ordering and<br>Operations System", 690, 340, 520, 520, SYSTEM_STYLE, "system")

    def lane_label(text: str, x: int, y: int, w: int = 260) -> None:
        b.label(text, x, y - 17, w, 34)

    # Top-left external entity: CUSTOMER.
    # Inputs run across the upper left and drop into the top-left side of the central process.
    customer_inputs = [
        ("User Credentials", 86, 520, (760, 382)),
        ("Account QR Scan Data", 116, 555, (805, 360)),
        ("Order Details", 146, 590, (860, 346)),
        ("Payment / Points Request", 176, 625, (920, 340)),
    ]
    for text, y, rail_x, target in customer_inputs:
        b.edge_abs((360, y), target, [(rail_x, y), (rail_x, target[1])])
        lane_label(text, 385, y, 260)

    # Outputs back to the customer use a separate lower-left return bundle.
    customer_outputs = [
        ("Menu and Stock Information", (690, 510), 455, 255, 105),
        ("Payment Link / Pickup QR", (690, 555), 425, 285, 145),
        ("Order Status and Receipt", (695, 600), 395, 315, 185),
        ("Points and Vouchers", (710, 645), 365, 345, 225),
    ]
    for text, source, rail_x, anchor_x, label_y in customer_outputs:
        b.edge_abs(source, (anchor_x, 230), [(rail_x, source[1]), (rail_x, 250), (anchor_x, 250)])
        lane_label(text, 385, source[1], 275)

    # Bottom-left external entity: STAFF / POS.
    # These use separated side-entry lanes so the lower half does not collapse under the system circle.
    staff_inputs = [
        ("POS Order Details", 910, 505, (360, 1095), (695, 690)),
        ("Account / Pickup QR Result", 950, 545, (360, 1125), (690, 730)),
        ("Payment Confirmation", 990, 585, (360, 1155), (690, 770)),
        ("Order Status Update", 1030, 625, (360, 1185), (705, 810)),
    ]
    for text, lane_y, rail_x, start, target in staff_inputs:
        b.edge_abs(start, target, [(rail_x, start[1]), (rail_x, lane_y), (target[0], lane_y)])
        lane_label(text, 390, lane_y, 300)

    staff_outputs = [
        ("Order Queue / KDS Details", 880, 470, (715, 690), (360, 1105)),
        ("Customer Account and Loyalty Info", 920, 430, (700, 730), (360, 1135)),
        ("Payment and Pickup Status", 960, 390, (695, 770), (360, 1165)),
        ("Delivery Booking Status", 1000, 350, (705, 810), (360, 1195)),
    ]
    for text, lane_y, rail_x, source, end in staff_outputs:
        b.edge_abs(source, end, [(rail_x, source[1]), (rail_x, lane_y), (end[0], lane_y)])
        lane_label(text, 390, lane_y, 305)

    # Top-right external entity: ADMIN.
    admin_inputs = [
        ("Menu and Inventory Updates", 86, 1380, (1140, 382)),
        ("Voucher and Loyalty Settings", 116, 1345, (1095, 360)),
        ("Staff Account Management", 146, 1310, (1040, 346)),
        ("System Configuration", 176, 1275, (980, 340)),
    ]
    for text, y, rail_x, target in admin_inputs:
        b.edge_abs((1540, y), target, [(rail_x, y), (rail_x, target[1])])
        lane_label(text, 1265, y, 260)

    admin_outputs = [
        ("Sales Reports", (1210, 510), 1445, 1620),
        ("Inventory and Order Records", (1210, 555), 1480, 1665),
        ("Audit Trails", (1205, 600), 1515, 1710),
        ("Staff Activity Logs", (1190, 645), 1550, 1755),
    ]
    for text, source, rail_x, anchor_x in admin_outputs:
        b.edge_abs(source, (anchor_x, 230), [(rail_x, source[1]), (rail_x, 250), (anchor_x, 250)])
        lane_label(text, 1265, source[1], 275)

    # Bottom-right external entity: EXTERNAL SERVICES.
    external_outputs = [
        ("Maya Checkout Request", 880, 1430, (1205, 690), (1540, 1105)),
        ("Lalamove Booking Request", 920, 1470, (1210, 730), (1540, 1135)),
    ]
    for text, lane_y, rail_x, source, end in external_outputs:
        b.edge_abs(source, end, [(rail_x, source[1]), (rail_x, lane_y), (end[0], lane_y)])
        lane_label(text, 1250, lane_y, 320)

    external_inputs = [
        ("Maya Payment Confirmation", 965, 1510, (1540, 1165), (1205, 775)),
        ("Lalamove Rider Status", 1005, 1550, (1540, 1195), (1190, 815)),
    ]
    for text, lane_y, rail_x, start, target in external_inputs:
        b.edge_abs(start, target, [(rail_x, start[1]), (rail_x, lane_y), (target[0], lane_y)])
        lane_label(text, 1250, lane_y, 320)

    path = OUTPUT_DIR / "cafeos_context_diagram.drawio"
    b.save(path)
    return path


def build_dfd(
    name: str,
    filename: str,
    entity_name: str,
    processes: list[tuple[str, str]],
    stores: list[tuple[str, str]],
    entity_inputs: list[tuple[str, int]],
    entity_outputs: list[tuple[str, int]],
    store_flows: list[tuple[int, str, str, str]],
) -> Path:
    b = DrawioBuilder(name, 1680, 1220)

    process_ids: list[str] = []
    process_ys = [60, 285, 510, 735, 960]
    process_x = 620
    process_w = 330
    process_h = 130
    entity_x = 35
    entity_y = 60
    entity_w = 300
    entity_h = process_ys[-1] + process_h - entity_y
    entity_right = entity_x + entity_w

    b.vertex(entity_name, entity_x, entity_y, entity_w, entity_h, ENTITY_STYLE, "entity")
    for index, ((number, title), y) in enumerate(zip(processes, process_ys), start=1):
        process_ids.append(b.vertex(process_label(number, title), process_x, y, process_w, process_h, PROCESS_STYLE, f"p{index}"))

    store_ids: dict[str, str] = {}
    store_x = 1285
    store_w = 320
    store_h = 58
    store_min_gap = 76
    store_y_by_id: dict[str, int] = {}
    for store_id, _store_name in stores:
        related_processes = [process_index for process_index, _direction, flow_store_id, _text in store_flows if flow_store_id == store_id]
        if related_processes:
            center = sum(process_ys[process_index - 1] + process_h // 2 for process_index in related_processes) / len(related_processes)
            store_y_by_id[store_id] = round(center - store_h / 2)
        else:
            store_y_by_id[store_id] = 80 + len(store_y_by_id) * store_min_gap

    last_y = 60
    for store_id, _store_name in stores:
        store_y_by_id[store_id] = max(store_y_by_id[store_id], last_y)
        last_y = store_y_by_id[store_id] + store_min_gap
    overflow = max(store_y_by_id.values(), default=0) + store_h - 1145
    if overflow > 0:
        for store_id in store_y_by_id:
            store_y_by_id[store_id] -= overflow

    for store_id, store_name in stores:
        store_ids[store_id] = b.vertex(store_label(store_id, store_name), store_x, store_y_by_id[store_id], store_w, store_h, STORE_STYLE, store_id)

    def lane_label(text: str, x: int, y: int, w: int = 285, h: int = 30) -> None:
        b.label(text, x, y - h // 2, w, h)

    for index, (text, process_index) in enumerate(entity_inputs):
        target_y = process_ys[process_index - 1] + 40
        b.edge_abs((entity_right, target_y), (process_x, target_y))
        lane_label(text, 370, target_y - 26, 225, 26)

    for index, (text, process_index) in enumerate(entity_outputs):
        source_y = process_ys[process_index - 1] + 92
        b.edge_abs((process_x, source_y), (entity_right, source_y))
        lane_label(text, 370, source_y + 26, 225, 26)

    process_port_counts: dict[int, int] = {}
    store_port_counts: dict[str, int] = {}
    for flow_index, (process_index, direction, store_id, text) in enumerate(store_flows):
        process_offset = process_port_counts.get(process_index, 0)
        store_offset = store_port_counts.get(store_id, 0)
        process_port_counts[process_index] = process_offset + 1
        store_port_counts[store_id] = store_offset + 1
        process_port_y = process_ys[process_index - 1] + 36 + process_offset * 24
        store_port_y = store_y_by_id[store_id] + 16 + store_offset * 16
        mid_x = 1045 + (flow_index % 5) * 38
        if direction == "to":
            start = (process_x + process_w, process_port_y)
            end = (store_x, store_port_y)
            label_y = min(process_port_y, store_port_y) - 26
        else:
            start = (store_x, store_port_y)
            end = (process_x + process_w, process_port_y)
            label_y = max(process_port_y, store_port_y) + 26
        b.edge_abs(start, end, [(mid_x, start[1]), (mid_x, end[1])])
        lane_label(text, 970, label_y, 290, 26)

    path = OUTPUT_DIR / filename
    b.save(path)
    return path


def build_all() -> list[Path]:
    paths = [build_context_diagram()]

    paths.append(
        build_dfd(
            "Customer Perspective DFD",
            "cafeos_dfd_customer_perspective.drawio",
            "CUSTOMER",
            [
                ("1.0", "Login / Account Access"),
                ("2.0", "Browse Menu"),
                ("3.0", "Create Customer Order"),
                ("4.0", "Process Payment and Pickup Confirmation"),
                ("5.0", "Manage Loyalty and Track Order"),
            ],
            [
                ("D1", "profiles"),
                ("D2", "menu_items"),
                ("D3", "orders"),
                ("D4", "order_items"),
                ("D5", "payment_delivery_records"),
                ("D6", "vouchers_loyalty"),
            ],
            [
                ("User Credentials", 1),
                ("Menu Search / Category Selection", 2),
                ("Selected Items and Customizations", 3),
                ("Payment Method / Checkout Request", 4),
                ("Account QR / Points or Voucher Request", 5),
            ],
            [
                ("System Entry / Account Status", 1),
                ("Menu List / Item Details", 2),
                ("Cart Summary / Order Review", 3),
                ("Payment Link / Pickup QR Status", 4),
                ("Points, Vouchers, and Order Tracking", 5),
            ],
            [
                (1, "to", "D1", "User Details"),
                (1, "from", "D1", "User Details"),
                (2, "to", "D2", "Menu Query"),
                (2, "from", "D2", "Menu Details / Stock Availability"),
                (3, "to", "D3", "Order Information"),
                (3, "to", "D4", "Order Item Details"),
                (3, "from", "D3", "Order Details"),
                (3, "from", "D4", "Item Details"),
                (4, "to", "D5", "Payment and Delivery Details"),
                (4, "from", "D5", "Payment Confirmation / Delivery Status"),
                (5, "to", "D6", "Loyalty and Voucher Query"),
                (5, "from", "D6", "Voucher Details / Points Record"),
            ],
        )
    )

    paths.append(
        build_dfd(
            "Staff/POS Perspective DFD",
            "cafeos_dfd_staff_pos_perspective.drawio",
            "STAFF / POS",
            [
                ("1.0", "Login and Access POS"),
                ("2.0", "Scan Account or Pickup QR"),
                ("3.0", "Create and Process POS Order"),
                ("4.0", "Manage KDS and Order Status"),
                ("5.0", "Book Delivery and Complete Order"),
            ],
            [
                ("D1", "profiles"),
                ("D2", "pickup_tokens"),
                ("D3", "orders"),
                ("D4", "order_items"),
                ("D5", "order_status_history"),
                ("D6", "payment_delivery_records"),
                ("D7", "inventory_logs"),
            ],
            [
                ("Staff Credentials", 1),
                ("Account QR / Pickup QR Scan", 2),
                ("POS Order and Payment Details", 3),
                ("Kitchen Status Update", 4),
                ("Delivery or Completion Request", 5),
            ],
            [
                ("System Entry / Staff Session", 1),
                ("Customer Account / Pickup Result", 2),
                ("Order Queue / Receipt Details", 3),
                ("KDS and Ready Status", 4),
                ("Delivery Status / Completed Order", 5),
            ],
            [
                (1, "to", "D1", "Staff Session Details"),
                (1, "from", "D1", "Staff User Details"),
                (2, "to", "D2", "QR Token Query"),
                (2, "from", "D2", "Pickup Token Details"),
                (3, "to", "D3", "Order Information"),
                (3, "to", "D4", "Order Item Details"),
                (3, "from", "D3", "Order Details"),
                (4, "to", "D5", "Status History"),
                (4, "from", "D3", "Active Order List"),
                (5, "to", "D6", "Delivery Booking Details"),
                (5, "from", "D6", "Delivery / Payment Status"),
                (5, "to", "D7", "Inventory Deduction Log"),
            ],
        )
    )

    paths.append(
        build_dfd(
            "Admin Perspective DFD",
            "cafeos_dfd_admin_perspective.drawio",
            "ADMIN",
            [
                ("1.0", "Login and Authorize Admin"),
                ("2.0", "Manage Menu and Inventory"),
                ("3.0", "Manage Vouchers and Loyalty"),
                ("4.0", "Manage Staff and Security"),
                ("5.0", "Monitor Reports and Configuration"),
            ],
            [
                ("D1", "profiles"),
                ("D2", "menu_items"),
                ("D3", "ingredients_inventory"),
                ("D4", "vouchers_loyalty"),
                ("D5", "staff_security_logs"),
                ("D6", "orders_reports"),
                ("D7", "store_delivery_settings"),
            ],
            [
                ("Admin Credentials", 1),
                ("Menu / Inventory Updates", 2),
                ("Voucher and Loyalty Settings", 3),
                ("Staff Account / Security Request", 4),
                ("Report and Configuration Request", 5),
            ],
            [
                ("System Entry / Admin Access", 1),
                ("Menu and Stock Records", 2),
                ("Voucher / Loyalty Summary", 3),
                ("Staff and Audit Details", 4),
                ("Reports and Settings Summary", 5),
            ],
            [
                (1, "to", "D1", "Admin User Details"),
                (1, "from", "D1", "Profile and Role Details"),
                (2, "to", "D2", "Menu Item Updates"),
                (2, "from", "D2", "Menu Details"),
                (2, "to", "D3", "Inventory Adjustment"),
                (2, "from", "D3", "Stock Details"),
                (3, "to", "D4", "Voucher / Points Rules"),
                (3, "from", "D4", "Claims and Loyalty Details"),
                (4, "to", "D5", "Staff and Authorization Updates"),
                (4, "from", "D5", "Audit and Security Records"),
                (5, "from", "D6", "Sales and Order Reports"),
                (5, "to", "D7", "Store / Delivery Settings"),
                (5, "from", "D7", "Configuration Details"),
            ],
        )
    )

    return paths


def main() -> None:
    for path in build_all():
        print(f"WROTE={path}")


if __name__ == "__main__":
    main()

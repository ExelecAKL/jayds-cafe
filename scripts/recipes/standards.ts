/** Inventory portions for the current menu. These are proposed operating standards,
 * not a claim that a barista has taste-tested or physically measured each recipe. */
const drinks = { "Hot 12oz": 0.8, "Medium 16oz": 1, "Large 22oz": 1.4 };
const coffee = { "Hot 12oz": 1, "Medium 16oz": 1, "Large 22oz": 1.5 };
const milk = { "Hot 12oz": 1.2, "Medium 16oz": 1, "Large 22oz": 1.4 };
const cold = { "Medium 16oz": 1, "Large 22oz": 1.4 };
type Portion = {
  ingredient: string;
  quantity: number;
  sizes?: Record<string, number>;
};
const p = (
  ingredient: string,
  quantity: number,
  sizes: Record<string, number> = {},
): Portion => ({ ingredient, quantity, sizes });
const espressoNames = [
  "Americano",
  "Coffee Latte",
  "Spanish Latte",
  "Vanilla Latte",
  "French Vanilla",
  "Caramel Latte",
  "Hazelnut Latte",
  "Macadamia Latte",
  "Butterscotch Latte",
  "Aussie Latte",
  "White Mocha Latte",
  "Cinnamon Cappuccino",
];
const signatureNames = [
  "Caramel Macchiato",
  "Caramel Mocha",
  "Salted Caramel",
  "Mocha",
  "Cloud Hazelnut",
  "Tres Leche Shaken Espresso",
  "Milo Shaken Espresso",
  "Hazelnut Mocha",
  "Biscoff",
  "Cocoa Lava",
  "Matcha Latte",
  "Strawberry Milk",
  "Nom Yen Pink Milk",
];
const frappeNames = [
  "Vanilla Milkshake",
  "Cookies & Cream",
  "Dark Chocolate",
  "Matcha",
  "Strawberries & Cream",
  "Caramel Frappe",
  "Mocha Frappe",
  "Java Chip",
  "Salted Caramel Frappe",
  "Biscoff Frappe",
];
const teaNames = [
  "Classic Milk Tea",
  "Wintermelon Milk Tea",
  "Okinawa Milk Tea",
  "Dark Chocolate Milk Tea",
  "Taro Milk Tea",
  "Cookies & Cream Milk Tea",
];
const sodaNames = [
  "Strawberry Soda",
  "Blueberry Soda",
  "Green Apple Soda",
  "Lychee Soda",
  "Honey Peach Soda",
];
const foodNames = [
  "Just Croffle",
  "S'mores",
  "Banatella",
  "Biscoff Croffle",
  "Almond Nutella",
  "Ham & Cheese",
];
const snackNames = ["Flavored Fries", "Nachos", "Chicken Pop"];
export const newRecipeIngredients = [
  {
    name: "Vanilla Ice Cream",
    unit: "g",
    pack_size: 1000,
    min_stock_alert: 500,
  },
  { name: "Tortilla Chips", unit: "g", pack_size: 500, min_stock_alert: 500 },
  {
    name: "Nacho Cheese Sauce",
    unit: "g",
    pack_size: 1000,
    min_stock_alert: 300,
  },
  {
    name: "Chicken Poppers (frozen)",
    unit: "g",
    pack_size: 1000,
    min_stock_alert: 500,
  },
];
const flavors: Record<string, Portion[]> = {
  "Spanish Latte": [p("Condensed Milk", 30, drinks)],
  "Vanilla Latte": [p("Vanilla Syrup", 25, drinks)],
  "French Vanilla": [p("French Vanilla Syrup", 25, drinks)],
  "Caramel Latte": [p("Caramel Syrup", 25, drinks)],
  "Hazelnut Latte": [p("Hazelnut Syrup", 25, drinks)],
  "Macadamia Latte": [p("Macadamia Syrup", 25, drinks)],
  "Butterscotch Latte": [p("Butterscotch Syrup", 25, drinks)],
  "White Mocha Latte": [p("White Mocha Sauce", 25, drinks)],
  "Cinnamon Cappuccino": [p("Cinnamon Powder", 0.5, drinks)],
  "Caramel Macchiato": [
    p("Vanilla Syrup", 15, drinks),
    p("Caramel Syrup", 15, drinks),
  ],
  "Caramel Mocha": [
    p("Chocolate Powder", 20, drinks),
    p("Caramel Syrup", 20, drinks),
  ],
  "Salted Caramel": [p("Salted Caramel Sauce", 30, drinks)],
  Mocha: [p("Chocolate Powder", 25, drinks)],
  "Cloud Hazelnut": [
    p("Hazelnut Syrup", 25, drinks),
    p("Sea Salt Foam Base", 20, cold),
  ],
  "Tres Leche Shaken Espresso": [
    p("Condensed Milk", 30, cold),
    p("Evaporated Milk", 30, cold),
  ],
  "Milo Shaken Espresso": [p("Milo Powder", 25, cold)],
  "Hazelnut Mocha": [
    p("Chocolate Powder", 20, drinks),
    p("Hazelnut Syrup", 20, drinks),
  ],
  Biscoff: [p("Biscoff Spread", 25, drinks)],
  "Cocoa Lava": [p("Chocolate Powder", 30, drinks)],
  "Matcha Latte": [p("Matcha Powder", 4, drinks)],
  "Strawberry Milk": [p("Strawberry Puree", 45, cold)],
  "Nom Yen Pink Milk": [p("Nom Yen Mix", 15, cold)],
};
const icedOnly = new Set([
  "Aussie Latte",
  "Cloud Hazelnut",
  "Tres Leche Shaken Espresso",
  "Milo Shaken Espresso",
  "Strawberry Milk",
  "Nom Yen Pink Milk",
]);
const entries: {
  id: string;
  name: string;
  category: string;
  icedOnly: boolean;
  portions: Portion[];
}[] = [];
function add(
  group: number,
  names: string[],
  category: string,
  recipe: (name: string) => Portion[],
  onlyCold = false,
) {
  names.forEach((name, index) =>
    entries.push({
      id: `e${group}000000-0000-4000-a000-${(index + 1).toString(16).padStart(12, "0")}`,
      name,
      category,
      icedOnly: onlyCold || icedOnly.has(name),
      portions: recipe(name),
    }),
  );
}
add(1, espressoNames, "Espresso", (name) => [
  p("Espresso Beans", 18, coffee),
  ...(name === "Americano"
    ? []
    : [p("Whole Milk", name === "Cinnamon Cappuccino" ? 160 : 200, milk)]),
  p("Ice", 150, cold),
  ...(flavors[name] || []),
]);
add(2, signatureNames, "Signature Drinks", (name) => [
  ...(signatureNames.indexOf(name) < 9
    ? [p("Espresso Beans", 18, coffee)]
    : []),
  p("Whole Milk", name === "Tres Leche Shaken Espresso" ? 160 : 200, milk),
  p("Ice", 150, cold),
  ...(flavors[name] || []),
]);
const frappeFlavors: Record<string, Portion[]> = {
  "Vanilla Milkshake": [p("Vanilla Syrup", 15, cold)],
  "Cookies & Cream": [p("Cookies Crumble", 25, cold)],
  "Dark Chocolate": [p("Chocolate Powder", 25, cold)],
  Matcha: [p("Matcha Powder", 4, cold)],
  "Strawberries & Cream": [p("Strawberry Puree", 45, cold)],
  "Caramel Frappe": [p("Caramel Syrup", 30, cold)],
  "Mocha Frappe": [p("Chocolate Powder", 25, cold)],
  "Java Chip": [
    p("Chocolate Chips", 20, cold),
    p("Chocolate Powder", 10, cold),
  ],
  "Salted Caramel Frappe": [p("Salted Caramel Sauce", 30, cold)],
  "Biscoff Frappe": [
    p("Biscoff Spread", 30, cold),
    p("Cookies Crumble", 10, cold),
  ],
};
add(
  3,
  frappeNames,
  "Frappes",
  (name) =>
    name === "Vanilla Milkshake"
      ? [
          p("Whole Milk", 150, cold),
          p("Vanilla Ice Cream", 180, cold),
          ...frappeFlavors[name],
        ]
      : [
          p("Whole Milk", 150, cold),
          p("Ice", 200, cold),
          p("Evaporated Milk", 30, cold),
          ...(frappeNames.indexOf(name) >= 5
            ? [p("Espresso Beans", 18, coffee)]
            : []),
          ...frappeFlavors[name],
        ],
  true,
);
const teaFlavors: Record<string, Portion[]> = {
  "Classic Milk Tea": [p("Simple Syrup", 20, cold)],
  "Wintermelon Milk Tea": [p("Wintermelon Powder", 20, cold)],
  "Okinawa Milk Tea": [p("Brown Sugar Syrup", 30, cold)],
  "Dark Chocolate Milk Tea": [p("Chocolate Powder", 20, cold)],
  "Taro Milk Tea": [p("Taro Powder", 20, cold)],
  "Cookies & Cream Milk Tea": [p("Cookies Crumble", 20, cold)],
};
add(
  4,
  teaNames,
  "Milk Teas",
  (name) => [
    p("Black Tea Bags", 1, { "Medium 16oz": 1, "Large 22oz": 2 }),
    p("Whole Milk", 120, cold),
    p("Ice", 150, cold),
    ...teaFlavors[name],
  ],
  true,
);
add(
  5,
  sodaNames,
  "Refreshers",
  (name) => [
    p("Soda Water", 250, cold),
    p("Ice", 150, cold),
    p(name.replace(" Soda", " Puree"), 45, cold),
  ],
  true,
);
const foodFlavors: Record<string, Portion[]> = {
  "Just Croffle": [p("Powdered Sugar", 5)],
  "S'mores": [p("Marshmallows", 20), p("Chocolate Chips", 15)],
  Banatella: [p("Banana", 0.5), p("Nutella", 20)],
  "Biscoff Croffle": [p("Biscoff Spread", 20)],
  "Almond Nutella": [p("Nutella", 20), p("Almonds (sliced)", 10)],
  "Ham & Cheese": [p("Ham Slice", 2), p("Cheese Slice", 1)],
};
add(6, foodNames, "Croffles", (name) => [
  p("Croffle Dough", 1),
  ...foodFlavors[name],
]);
const snacks: Record<string, Portion[]> = {
  "Flavored Fries": [p("French Fries (frozen)", 150), p("Frying Oil", 15)],
  Nachos: [p("Tortilla Chips", 90), p("Nacho Cheese Sauce", 40)],
  "Chicken Pop": [p("Chicken Poppers (frozen)", 150), p("Frying Oil", 15)],
};
add(7, snackNames, "Snacks", (name) => snacks[name]);
export const recipeStandards = entries;
export const recipePreparationNotes = {
  espresso:
    "18 g dry dose per standard espresso; dial the yield to the café beans and basket. Hot drinks have no ice. Hot milk is steamed; cappuccino milk is foamed.",
  tea: "Brew one tea bag in approximately 150 ml potable water for 16 oz; two in 220 ml for 22 oz. Cool before adding 120/168 ml milk and ice. Brewing water is a preparation input, not a counted stock item.",
  americano:
    "Add approximately 180 ml potable water for iced 16 oz, 250 ml for 22 oz or 250 ml hot water for 12 oz. Water is not a counted stock item.",
  blended:
    "Chill extracted coffee before blending. Evaporated milk supplies the cream component for ice-blended frappes; Vanilla Milkshake instead uses milk and ice cream.",
  sweets:
    "Less Sweet halves the separately dosed syrup/sauce/condensed milk. It cannot remove sugar already present in puree, powder or ice cream. Extra Sweet adds 15 ml simple syrup.",
  foods:
    "Croffle dough is one ready-to-cook portion; do not also consume flour, butter and eggs. Melt chocolate chips for drizzle/smores. Frying oil is a 15 ml per-portion allocation, not the fryer fill volume. New ingredient counts start at zero.",
  pearls:
    "A 20 g dry tapioca allocation per topping portion assumes approximately 2.5x cooked yield; verify supplier yield during preparation.",
};

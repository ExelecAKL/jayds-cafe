// apps/customer/context/CartContext.tsx
// Customer cart state with localStorage persistence and order metadata

"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useReducer,
  useState,
} from "react";
import type { CartItem } from "@cafeos/shared/types";
import { useAuth } from "@cafeos/shared/hooks/useAuth";
import { normalizeCartLines, validCartLines } from "../utils/cartDraft";

export type CustomerOrderType = "pickup" | "delivery";

export interface AppliedVoucher {
  code: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  applicable_item_ids?: string[] | null;
  application_mode?: "whole_order" | "selected_items";
  max_discount_amount?: number | null;
}

export interface CartState {
  items: CartItem[];
  orderType: CustomerOrderType;
  tableNumber: string;
  orderNote: string;
  specialRemarks: string;
  voucher: AppliedVoucher | null;
}

export interface CartComputed {
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
}

type CartAction =
  | { type: "ADD_ITEM"; payload: CartItem }
  | { type: "REMOVE_ITEM"; payload: string }
  | { type: "UPDATE_QUANTITY"; payload: { id: string; quantity: number } }
  | { type: "UPDATE_NOTES"; payload: { id: string; notes: string } }
  | { type: "SET_ORDER_TYPE"; payload: CustomerOrderType }
  | { type: "SET_TABLE_NUMBER"; payload: string }
  | { type: "SET_ORDER_NOTE"; payload: string }
  | { type: "SET_SPECIAL_REMARKS"; payload: string }
  | { type: "APPLY_VOUCHER"; payload: AppliedVoucher }
  | { type: "REMOVE_VOUCHER" }
  | { type: "CLEAR_CART" }
  | { type: "HYDRATE"; payload: CartState };

interface CartContextValue extends CartState, CartComputed {
  hydrated: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateItemNotes: (id: string, notes: string) => void;
  setOrderType: (type: CustomerOrderType) => void;
  setTableNumber: (num: string) => void;
  setOrderNote: (note: string) => void;
  setSpecialRemarks: (remarks: string) => void;
  applyVoucher: (voucher: AppliedVoucher) => void;
  removeVoucher: () => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const initialState: CartState = {
  items: [],
  orderType: "pickup",
  tableNumber: "",
  orderNote: "",
  specialRemarks: "",
  voucher: null,
};

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD_ITEM": {
      return {
        ...state,
        items: normalizeCartLines([...state.items, action.payload]),
      };
    }
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      };
    case "UPDATE_QUANTITY":
      if (!Number.isFinite(action.payload.quantity)) return state;
      if (action.payload.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((item) => item.id !== action.payload.id),
        };
      }

      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? {
                ...item,
                quantity: Math.min(
                  99,
                  Math.max(1, Math.floor(action.payload.quantity)),
                ),
              }
            : item,
        ),
      };
    case "UPDATE_NOTES":
      return {
        ...state,
        items: normalizeCartLines(
          state.items.map((item) =>
            item.id === action.payload.id
              ? { ...item, notes: action.payload.notes }
              : item,
          ),
        ),
      };
    case "SET_ORDER_TYPE":
      return {
        ...state,
        orderType: action.payload,
        tableNumber: "",
      };
    case "SET_TABLE_NUMBER":
      return { ...state, tableNumber: action.payload };
    case "SET_ORDER_NOTE":
      return { ...state, orderNote: action.payload };
    case "SET_SPECIAL_REMARKS":
      return { ...state, specialRemarks: action.payload };
    case "APPLY_VOUCHER":
      return { ...state, voucher: action.payload };
    case "REMOVE_VOUCHER":
      return { ...state, voucher: null };
    case "CLEAR_CART":
      return {
        ...initialState,
        orderType: state.orderType,
      };
    case "HYDRATE":
      return {
        ...initialState,
        ...action.payload,
        items: validCartLines(action.payload.items),
      };
    default:
      return state;
  }
}

function computeCart(state: CartState): CartComputed {
  const subtotal = state.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const itemCount = state.items.reduce((sum, item) => sum + item.quantity, 0);

  let discount = 0;
  if (state.voucher) {
    let baseAmount = subtotal;

    if (
      state.voucher.application_mode === "selected_items" &&
      state.voucher.applicable_item_ids &&
      state.voucher.applicable_item_ids.length > 0
    ) {
      baseAmount = state.items
        .filter((item) =>
          state.voucher!.applicable_item_ids!.includes(
            item.menu_item_id || item.id,
          ),
        )
        .reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    if (state.voucher.discount_type === "percentage") {
      discount = baseAmount * (state.voucher.discount_value / 100);
      if (
        state.voucher.max_discount_amount &&
        state.voucher.max_discount_amount > 0
      ) {
        discount = Math.min(discount, state.voucher.max_discount_amount);
      }
    } else {
      discount = state.voucher.discount_value;
    }

    // Cap discount to not exceed the subtotal or applicable base amount
    discount = Math.min(discount, baseAmount);
  }

  return {
    subtotal,
    discount,
    total: Math.max(0, subtotal - discount),
    itemCount,
  };
}

const CART_STORAGE_KEY = "cafeos-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  const [state, dispatchRaw] = useReducer(cartReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [storageOwner, setStorageOwner] = useState<string | null>(null);
  const owner = user?.id ?? "guest";
  const activeOwner = useRef(owner);
  useLayoutEffect(() => {
    activeOwner.current = owner;
  }, [owner]);
  const dispatch = useCallback(
    (action: CartAction) => {
      if (activeOwner.current === owner) dispatchRaw(action);
    },
    [owner],
  );

  useEffect(() => {
    if (!initialized) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setHydrated(false);
      dispatch({ type: "HYDRATE", payload: initialState });
      try {
        if (storageOwner && storageOwner !== owner) {
          if (storageOwner !== "guest")
            localStorage.removeItem(`${CART_STORAGE_KEY}:${storageOwner}`);
          sessionStorage.removeItem("checkout_confirm");
          sessionStorage.removeItem(`jayds-checkout-form:${storageOwner}`);
          // Retain owner-scoped uncertain submission keys for recovery on their next sign-in.
          sessionStorage.removeItem("jayds-submission:customer");
          sessionStorage.removeItem("jayds-payload:customer");
        }
        const saved =
          localStorage.getItem(`${CART_STORAGE_KEY}:${owner}`) ||
          (owner === "guest" ? localStorage.getItem(CART_STORAGE_KEY) : null);
        localStorage.removeItem(CART_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as CartState;
          dispatch({ type: "HYDRATE", payload: parsed });
        } else dispatch({ type: "HYDRATE", payload: initialState });
      } catch {
        // Ignore invalid local cart state.
      } finally {
        setHydrated(true);
        setStorageOwner(owner);
      }
    });
    return () => {
      cancelled = true;
    };
    // storageOwner is a record of the previous owner, not a hydration trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, initialized]);

  useEffect(() => {
    if (!hydrated || storageOwner !== owner) {
      return;
    }

    try {
      localStorage.setItem(
        `${CART_STORAGE_KEY}:${owner}`,
        JSON.stringify(state),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [hydrated, state, storageOwner, owner]);

  const addItem = useCallback(
    (item: CartItem) => {
      dispatch({ type: "ADD_ITEM", payload: item });
    },
    [dispatch],
  );

  const removeItem = useCallback(
    (id: string) => {
      dispatch({ type: "REMOVE_ITEM", payload: id });
    },
    [dispatch],
  );

  const updateQuantity = useCallback(
    (id: string, quantity: number) => {
      dispatch({ type: "UPDATE_QUANTITY", payload: { id, quantity } });
    },
    [dispatch],
  );

  const updateItemNotes = useCallback(
    (id: string, notes: string) => {
      dispatch({ type: "UPDATE_NOTES", payload: { id, notes } });
    },
    [dispatch],
  );

  const setOrderType = useCallback(
    (type: CustomerOrderType) => {
      dispatch({ type: "SET_ORDER_TYPE", payload: type });
    },
    [dispatch],
  );

  const setTableNumber = useCallback(
    (num: string) => {
      dispatch({ type: "SET_TABLE_NUMBER", payload: num });
    },
    [dispatch],
  );

  const setOrderNote = useCallback(
    (note: string) => {
      dispatch({ type: "SET_ORDER_NOTE", payload: note });
    },
    [dispatch],
  );

  const setSpecialRemarks = useCallback(
    (remarks: string) => {
      dispatch({ type: "SET_SPECIAL_REMARKS", payload: remarks });
    },
    [dispatch],
  );

  const applyVoucher = useCallback(
    (voucher: AppliedVoucher) => {
      dispatch({ type: "APPLY_VOUCHER", payload: voucher });
    },
    [dispatch],
  );

  const removeVoucher = useCallback(() => {
    dispatch({ type: "REMOVE_VOUCHER" });
  }, [dispatch]);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR_CART" });
  }, [dispatch]);

  const activeState = storageOwner === owner ? state : initialState;
  const computed = computeCart(activeState);

  const value: CartContextValue = {
    ...activeState,
    ...computed,
    hydrated: hydrated && storageOwner === owner,
    addItem,
    removeItem,
    updateQuantity,
    updateItemNotes,
    setOrderType,
    setTableNumber,
    setOrderNote,
    setSpecialRemarks,
    applyVoucher,
    removeVoucher,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}

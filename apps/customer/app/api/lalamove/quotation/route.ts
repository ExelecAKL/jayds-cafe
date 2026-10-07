// apps/customer/app/api/lalamove/quotation/route.ts
// Get delivery fee quotation from Lalamove

import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@cafeos/shared/server/request-body";
import { lalamoveRequest } from "../lib";
import { createQuoteToken } from "../quote-token";
import { readCustomerBranch } from "../../branch/lib";
import { withinCoverage, coordinates } from "../../../../lib/location";
import {
  getServerDb,
  assertSameOrigin,
  apiAccessErrorResponse,
} from "../../../../lib/server-access";

interface QuotationResponse {
  data: {
    quotationId: string;
    expiresAt: string;
    priceBreakdown: {
      base: string;
      total: string;
      currency: string;
      [key: string]: string;
    };
    distance: { value: string; unit: string };
    stops: {
      stopId: string;
      coordinates: { lat: string; lng: string };
      address: string;
    }[];
  };
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const { dropoffLat, dropoffLng, dropoffAddress } =
      await readJsonBody(request);

    if (
      !coordinates(dropoffLat, dropoffLng) ||
      typeof dropoffAddress !== "string" ||
      !dropoffAddress.trim() ||
      dropoffAddress.length > 500
    ) {
      return NextResponse.json(
        { error: "Missing delivery address information" },
        { status: 400 },
      );
    }
    const branch = await readCustomerBranch(getServerDb());
    if (!withinCoverage(dropoffLat, dropoffLng, branch))
      return NextResponse.json(
        {
          error: `Delivery is available within ${branch.delivery_radius_km} km of the café. You can still choose pickup.`,
        },
        { status: 409 },
      );

    const body = {
      data: {
        serviceType: "MOTORCYCLE",
        language: "en_PH",
        stops: [
          {
            coordinates: {
              lat: String(branch.latitude),
              lng: String(branch.longitude),
            },
            address: branch.address,
          },
          {
            coordinates: { lat: String(dropoffLat), lng: String(dropoffLng) },
            address: String(dropoffAddress),
          },
        ],
        item: {
          quantity: "1",
          weight: "LESS_THAN_3_KG",
          categories: ["FOOD_DELIVERY"],
          handlingInstructions: ["KEEP_UPRIGHT"],
        },
      },
    };

    const result = await lalamoveRequest<QuotationResponse>(
      "POST",
      "/v3/quotations",
      body,
    );

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status || 500 },
      );
    }

    const qData = result.data?.data;
    if (
      !qData ||
      qData.priceBreakdown.currency !== "PHP" ||
      !Number.isFinite(Number(qData.priceBreakdown.total)) ||
      Number(qData.priceBreakdown.total) < 0 ||
      !(Date.parse(qData.expiresAt) > Date.now())
    ) {
      return NextResponse.json(
        { error: "Invalid quotation response" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      quoteToken: createQuoteToken({
        quotationId: qData.quotationId,
        fee: Number(qData.priceBreakdown.total),
        expiresAt: qData.expiresAt,
        lat: Number(dropoffLat),
        lng: Number(dropoffLng),
        address: String(dropoffAddress),
        branchVersion: branch.version,
      }),
      quotationId: qData.quotationId,
      deliveryFee: parseFloat(qData.priceBreakdown.total),
      currency: qData.priceBreakdown.currency,
      expiresAt: qData.expiresAt,
      distance: qData.distance,
      stops: qData.stops, // stopId values needed when placing the order
    });
  } catch (err) {
    return apiAccessErrorResponse(err);
  }
}

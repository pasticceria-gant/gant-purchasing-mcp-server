import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "GANT Purchasing MCP",
    version: "1.0.0",
  });

  async init() {

    // 1. Confronto prezzi fornitori
    this.server.tool(
      "compare_supplier_prices",
      "Confronta le offerte di più fornitori e individua il prezzo più conveniente.",
      {
        product: z.string(),
        offers: z.array(
          z.object({
            supplier: z.string(),
            price: z.number(),
            quantity: z.number().positive(),
            unit: z.string().optional(),
          })
        ),
      },
      async ({ product, offers }) => {
        const results = offers.map((offer) => ({
          ...offer,
          normalizedPrice: offer.price / offer.quantity,
        }));

        results.sort(
          (a, b) => a.normalizedPrice - b.normalizedPrice
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  product,
                  bestSupplier: results[0],
                  comparison: results,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // 2. Conversione prezzo in CHF/kg
    this.server.tool(
      "calculate_price_per_kg",
      "Calcola il prezzo al kg partendo dal prezzo della confezione e dal peso.",
      {
        priceCHF: z.number(),
        weightKg: z.number().positive(),
      },
      async ({ priceCHF, weightKg }) => {
        const pricePerKg = priceCHF / weightKg;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  priceCHF,
                  weightKg,
                  pricePerKgCHF:
                    Math.round(pricePerKg * 100) / 100,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // 3. Analisi variazione prezzo
    this.server.tool(
      "analyze_price_change",
      "Calcola la variazione percentuale tra un vecchio prezzo e un nuovo prezzo.",
      {
        oldPrice: z.number().positive(),
        newPrice: z.number().positive(),
      },
      async ({ oldPrice, newPrice }) => {
        const difference = newPrice - oldPrice;
        const percentage =
          (difference / oldPrice) * 100;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  oldPrice,
                  newPrice,
                  difference:
                    Math.round(difference * 100) / 100,
                  percentageChange:
                    Math.round(percentage * 100) / 100,
                  trend:
                    difference > 0
                      ? "increase"
                      : difference < 0
                      ? "decrease"
                      : "unchanged",
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // 4. Analisi scorte
    this.server.tool(
      "analyze_stock",
      "Analizza la disponibilità di magazzino rispetto alla scorta minima.",
      {
        product: z.string(),
        currentStock: z.number().nonnegative(),
        minimumStock: z.number().nonnegative(),
      },
      async ({
        product,
        currentStock,
        minimumStock,
      }) => {
        const shortage = Math.max(
          minimumStock - currentStock,
          0
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  product,
                  currentStock,
                  minimumStock,
                  reorderRequired: shortage > 0,
                  shortage,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // 5. Calcolo quantità ordine
    this.server.tool(
      "calculate_order_quantity",
      "Calcola una quantità suggerita da ordinare considerando stock, consumo previsto e scorta di sicurezza.",
      {
        product: z.string(),
        currentStock: z.number().nonnegative(),
        expectedConsumption: z.number().nonnegative(),
        safetyStock: z.number().nonnegative(),
      },
      async ({
        product,
        currentStock,
        expectedConsumption,
        safetyStock,
      }) => {
        const required =
          expectedConsumption +
          safetyStock -
          currentStock;

        const suggestedOrder = Math.max(
          required,
          0
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  product,
                  currentStock,
                  expectedConsumption,
                  safetyStock,
                  suggestedOrder,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // 6. Confronto offerte completo
    this.server.tool(
      "evaluate_supplier_offers",
      "Valuta offerte fornitori considerando prezzo, quantità e costo normalizzato.",
      {
        product: z.string(),
        offers: z.array(
          z.object({
            supplier: z.string(),
            totalPriceCHF: z.number(),
            totalWeightKg: z.number().positive(),
          })
        ),
      },
      async ({ product, offers }) => {
        const comparison = offers
          .map((offer) => ({
            supplier: offer.supplier,
            totalPriceCHF: offer.totalPriceCHF,
            totalWeightKg: offer.totalWeightKg,
            pricePerKgCHF:
              Math.round(
                (offer.totalPriceCHF /
                  offer.totalWeightKg) *
                  100
              ) / 100,
          }))
          .sort(
            (a, b) =>
              a.pricePerKgCHF -
              b.pricePerKgCHF
          );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  product,
                  recommendedSupplier:
                    comparison[0]?.supplier,
                  offers: comparison,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response(
      "GANT Purchasing MCP Server - OK",
      { status: 200 }
    );
  },
};

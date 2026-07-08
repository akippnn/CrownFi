// Set up database environment variable for testing before importing anything
process.env.DATABASE_URL = "file:./test.db";
process.env.STELLAR_MODE = "mock";
process.env.WALLET_PROVIDER = "mock";

import { NextRequest } from "next/server";
import { db } from "./db";
import { POST as ticketPOST, GET as ticketGET } from "../app/api/tickets/route";
import { TICKET_TIERS, TIER_LIST } from "./tiers";

function assert(cond: boolean, label: string) {
  if (!cond) {
    console.error("FAIL:", label);
    process.exit(1);
  }
  console.log("ok:", label);
}

async function runTests() {
  console.log("Starting ticketing system tests...\n");

  // 1. Verify Tiers structure
  assert(TICKET_TIERS.Silver.priceUsdc === 50, "Silver tier is 50 USDC");
  assert(TICKET_TIERS.Gold.priceUsdc === 100, "Gold tier is 100 USDC");
  assert(TICKET_TIERS.Diamond.priceUsdc === 200, "Diamond tier is 200 USDC");
  assert(TIER_LIST.length === 3, "There are exactly 3 ticket tiers");

  // Clean up database tables before test
  await db.ticket.deleteMany({});
  await db.fan.deleteMany({});

  // 2. Setup a mock Fan
  const fanHandle = "testfan123";
  const fan = await db.fan.create({
    data: {
      handle: fanHandle,
      email: "testfan@crownfi.xyz",
      points: 10,
    },
  });
  assert(fan.id !== undefined, "Fan created successfully in test database");

  // 3. Test POST /api/tickets - Validation Error (Missing fields)
  {
    const req = new NextRequest("http://localhost/api/tickets", {
      method: "POST",
      body: JSON.stringify({ fanId: fan.id }),
    });
    const res = await ticketPOST(req);
    assert(res.status === 400, "POST /api/tickets returns 400 when fields are missing");
    const json = await res.json();
    assert(json.error === "missing_fields", "Error message matches 'missing_fields'");
  }

  // 4. Test POST /api/tickets - Mock fallback when fan doesn't exist in DB
  {
    const req = new NextRequest("http://localhost/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        fanId: "nonexistent-fan-id",
        eventName: "Coronation Night 2026",
        tier: "Gold",
        priceUsdc: 100,
      }),
    });
    const res = await ticketPOST(req);
    assert(res.status === 200, "POST /api/tickets returns 200 via mock fallback when fan is not found");
    const json = await res.json();
    assert(json.ok === true, "Mock fallback response has ok: true");
    assert(json.ticket.fan.handle === "demo_fan", "Auto-generated fan handle is 'demo_fan'");
  }

  // 5. Test POST /api/tickets - Success (Mock purchase with real fan)
  let createdTicketId = "";
  {
    const req = new NextRequest("http://localhost/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        fanId: fan.id,
        eventName: "Coronation Night 2026",
        tier: "Diamond",
        priceUsdc: 200,
      }),
    });
    const res = await ticketPOST(req);
    assert(res.status === 200, "POST /api/tickets returns 200 on successful mock purchase");
    const json = await res.json();
    assert(json.ok === true, "Response JSON has ok: true");
    assert(json.ticket.tier === "Diamond", "Ticket tier is correct");
    assert(json.ticket.priceUsdc === 200, "Ticket price is correct");
    assert(json.ticket.tokenId !== null, "Ticket has a generated token ID");
    assert(json.ticket.mintTx !== null, "Ticket has a mock mint transaction hash");
    createdTicketId = json.ticket.id;

    // Verify ticket fields are populated
    assert(!!json.ticket.tokenId, "Ticket has a valid token ID");
    assert(!!json.ticket.mintTx, "Ticket has a valid mint tx hash");
  }

  // 6. Test GET /api/tickets - Retrieve tickets
  {
    const res = await ticketGET();
    assert(res.status === 200, "GET /api/tickets returns 200");
    const tickets = await res.json();
    assert(Array.isArray(tickets), "GET /api/tickets returns an array");
    assert(tickets.length === 1, "GET /api/tickets returns 1 ticket");
    assert(tickets[0].id === createdTicketId, "Returned ticket matches the created ticket");
    assert(tickets[0].fan.handle === fanHandle, "Ticket includes populated fan relationship with correct handle");
  }

  console.log("\nAll Ticketing checks passed.");
}

runTests().catch((e) => {
  console.error("Test execution failed with error:", e);
  process.exit(1);
});

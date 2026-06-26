import { supabase } from "../../../lib/supabase";

/**
 * GET /api/admin/stats
 *
 * Returns dashboard statistics:
 *   totalOrders, activeRentals, pendingOrders, cancelledOrders,
 *   monthlyRevenue, totalCustomers, upcomingDeliveries, recentOrders
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const expected = process.env.ADMIN_PASSWORD;
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || token !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // ---- Count queries (head: true = no rows returned) ----

    const { count: totalOrders, error: e1 } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });
    if (e1) throw new Error(`totalOrders: ${e1.message}`);

    const { count: activeRentals, error: e2 } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");
    if (e2) throw new Error(`activeRentals: ${e2.message}`);

    const { count: pendingOrders, error: e3 } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "deposit_paid"]);
    if (e3) throw new Error(`pendingOrders: ${e3.message}`);

    const { count: cancelledOrders, error: e4 } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "cancelled");
    if (e4) throw new Error(`cancelledOrders: ${e4.message}`);

    const { count: totalCustomers, error: e5 } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });
    if (e5) throw new Error(`totalCustomers: ${e5.message}`);

    // ---- Upcoming deliveries ----
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const { count: upcomingDeliveries, error: e6 } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .in("status", ["deposit_paid", "authorized"])
      .gte("delivery_date", today);
    if (e6) throw new Error(`upcomingDeliveries: ${e6.message}`);

    // ---- Monthly revenue (sum rental_monthly_cents for active orders) ----
    const { data: activeOrders, error: e7 } = await supabase
      .from("orders")
      .select("rental_monthly_cents")
      .eq("status", "active");
    if (e7) throw new Error(`monthlyRevenue: ${e7.message}`);

    const monthlyRevenue =
      (activeOrders || []).reduce(
        (sum, o) => sum + (o.rental_monthly_cents || 0),
        0
      ) / 100;

    // ---- Recent orders (5 latest with customer + items) ----
    const { data: recentRaw, error: e8 } = await supabase
      .from("orders")
      .select("*, customers!inner(*), order_items(*)")
      .order("created_at", { ascending: false })
      .limit(5);
    if (e8) throw new Error(`recentOrders: ${e8.message}`);

    const recentOrders = (recentRaw || []).map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.created_at,
      customer: o.customers
        ? { name: o.customers.name, email: o.customers.email }
        : null,
      items: (o.order_items || []).map((i) => ({
        setType: i.set_type,
        palette: i.palette,
      })),
    }));

    // ---- Response ----
    res.status(200).json({
      totalOrders,
      activeRentals,
      pendingOrders,
      cancelledOrders,
      monthlyRevenue,
      totalCustomers,
      upcomingDeliveries,
      recentOrders,
    });
  } catch (err) {
    console.error("admin stats error:", err);
    res.status(500).json({ error: err.message });
  }
}

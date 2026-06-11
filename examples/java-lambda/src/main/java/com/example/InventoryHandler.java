package com.example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;

import java.util.*;
import java.time.Instant;

/**
 * Inventory Service Lambda (Java).
 *
 * Handles stock management operations:
 *   - checkStock: verify product availability
 *   - reserveStock: temporarily hold items for an order
 *   - releaseStock: release a reservation
 *   - adjustStock: manually adjust inventory levels
 *
 * Standard AWS Lambda handler — no simulator-specific code.
 */
public class InventoryHandler implements RequestHandler<String, String> {

    private static final Gson gson = new Gson();

    // In-memory inventory store
    private static final Map<String, StockItem> inventory = new HashMap<>() {{
        put("prod-001", new StockItem("prod-001", "Wireless Headphones", 50, 0));
        put("prod-002", new StockItem("prod-002", "Running Shoes", 120, 0));
        put("prod-003", new StockItem("prod-003", "Coffee Maker", 75, 0));
        put("prod-004", new StockItem("prod-004", "Yoga Mat", 200, 0));
    }};

    // Active reservations
    private static final Map<String, Reservation> reservations = new HashMap<>();

    @Override
    public String handleRequest(String input, Context context) {
        JsonObject event = gson.fromJson(input, JsonObject.class);
        JsonObject payload = event.getAsJsonObject("payload");

        if (payload == null) {
            return gson.toJson(Map.of("error", "Missing payload"));
        }

        String operation = payload.has("operation") ? payload.get("operation").getAsString() : "";
        JsonObject data = payload.has("payload") ? payload.getAsJsonObject("payload") : payload;

        System.err.println("[InventoryLambda] Processing: " + operation);

        switch (operation) {
            case "checkStock":
                return checkStock(data);
            case "reserveStock":
                return reserveStock(data);
            case "releaseStock":
                return releaseStock(data);
            case "adjustStock":
                return adjustStock(data);
            default:
                return gson.toJson(Map.of("error", "Unknown operation: " + operation));
        }
    }

    private String checkStock(JsonObject data) {
        String productId = getStringField(data, "productId");
        if (productId == null) {
            return gson.toJson(Map.of("error", "productId is required"));
        }

        StockItem item = inventory.get(productId);
        if (item == null) {
            return gson.toJson(Map.of("error", "Product not found: " + productId));
        }

        int available = item.quantity - item.reserved;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("productId", item.productId);
        result.put("productName", item.name);
        result.put("totalStock", item.quantity);
        result.put("reserved", item.reserved);
        result.put("available", available);
        result.put("inStock", available > 0);

        return gson.toJson(result);
    }

    private String reserveStock(JsonObject data) {
        String productId = getStringField(data, "productId");
        String orderId = getStringField(data, "orderId");
        int quantity = getIntField(data, "quantity", 0);

        if (productId == null || orderId == null || quantity <= 0) {
            return gson.toJson(Map.of("error", "productId, orderId, and positive quantity required"));
        }

        StockItem item = inventory.get(productId);
        if (item == null) {
            return gson.toJson(Map.of("error", "Product not found: " + productId));
        }

        int available = item.quantity - item.reserved;
        if (quantity > available) {
            return gson.toJson(Map.of(
                "error", "Insufficient stock",
                "requested", quantity,
                "available", available
            ));
        }

        // Create reservation
        String reservationId = UUID.randomUUID().toString();
        item.reserved += quantity;

        Reservation reservation = new Reservation(reservationId, productId, orderId, quantity);
        reservations.put(reservationId, reservation);

        System.err.println("[InventoryLambda] Reserved " + quantity + "x " + productId + " for order " + orderId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reservationId", reservationId);
        result.put("productId", productId);
        result.put("orderId", orderId);
        result.put("quantity", quantity);
        result.put("status", "RESERVED");
        result.put("createdAt", Instant.now().toString());

        return gson.toJson(result);
    }

    private String releaseStock(JsonObject data) {
        String reservationId = getStringField(data, "reservationId");
        if (reservationId == null) {
            return gson.toJson(Map.of("error", "reservationId is required"));
        }

        Reservation reservation = reservations.remove(reservationId);
        if (reservation == null) {
            return gson.toJson(Map.of("error", "Reservation not found: " + reservationId));
        }

        StockItem item = inventory.get(reservation.productId);
        if (item != null) {
            item.reserved -= reservation.quantity;
        }

        System.err.println("[InventoryLambda] Released reservation " + reservationId);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reservationId", reservationId);
        result.put("status", "RELEASED");
        result.put("releasedAt", Instant.now().toString());

        return gson.toJson(result);
    }

    private String adjustStock(JsonObject data) {
        String productId = getStringField(data, "productId");
        int adjustment = getIntField(data, "adjustment", 0);
        String reason = getStringField(data, "reason");

        if (productId == null || adjustment == 0) {
            return gson.toJson(Map.of("error", "productId and non-zero adjustment required"));
        }

        StockItem item = inventory.get(productId);
        if (item == null) {
            return gson.toJson(Map.of("error", "Product not found: " + productId));
        }

        int newQuantity = item.quantity + adjustment;
        if (newQuantity < 0) {
            return gson.toJson(Map.of("error", "Cannot reduce stock below 0"));
        }

        item.quantity = newQuantity;
        System.err.println("[InventoryLambda] Adjusted " + productId + " by " + adjustment + " → " + newQuantity);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("productId", productId);
        result.put("previousStock", newQuantity - adjustment);
        result.put("adjustment", adjustment);
        result.put("currentStock", newQuantity);
        result.put("reason", reason != null ? reason : "manual adjustment");
        result.put("adjustedAt", Instant.now().toString());

        return gson.toJson(result);
    }

    // --- Helpers ---

    private String getStringField(JsonObject obj, String field) {
        JsonElement el = obj.get(field);
        return (el != null && !el.isJsonNull()) ? el.getAsString() : null;
    }

    private int getIntField(JsonObject obj, String field, int defaultValue) {
        JsonElement el = obj.get(field);
        return (el != null && !el.isJsonNull()) ? el.getAsInt() : defaultValue;
    }

    // --- Models ---

    private static class StockItem {
        String productId;
        String name;
        int quantity;
        int reserved;

        StockItem(String productId, String name, int quantity, int reserved) {
            this.productId = productId;
            this.name = name;
            this.quantity = quantity;
            this.reserved = reserved;
        }
    }

    private static class Reservation {
        String id;
        String productId;
        String orderId;
        int quantity;

        Reservation(String id, String productId, String orderId, int quantity) {
            this.id = id;
            this.productId = productId;
            this.orderId = orderId;
            this.quantity = quantity;
        }
    }
}

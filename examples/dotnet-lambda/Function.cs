using System.Text.Json;
using System.Text.Json.Serialization;

namespace DotnetLambda;

/// <summary>
/// .NET Lambda function for order processing.
/// Invoked by the AppSync simulator as a Lambda datasource.
/// 
/// This demonstrates how a .NET Lambda receives and processes AppSync events.
/// The function handles order processing: payment validation, inventory checks,
/// and status transitions.
/// </summary>
public class Function
{
    // Simulated in-memory order store
    private static readonly Dictionary<string, Order> _orders = new();

    /// <summary>
    /// Main Lambda handler invoked by the AppSync simulator.
    /// Receives the event as JSON from stdin (via LAMBDA_EVENT env var).
    /// </summary>
    public static OrderResponse FunctionHandler(AppSyncEvent input)
    {
        Console.Error.WriteLine($"[.NET Lambda] Processing: {input.Payload?.Operation}");

        if (input.Payload == null)
        {
            return new OrderResponse { Error = "Missing payload" };
        }

        // Resolve the orderId from either the top-level payload fields or nested payload.payload
        var resolvedPayload = ResolvePayload(input.Payload);

        return input.Payload.Operation switch
        {
            "processOrder" => ProcessOrder(resolvedPayload),
            "getOrderStatus" => GetOrderStatus(resolvedPayload),
            "cancelOrder" => CancelOrder(resolvedPayload),
            _ => new OrderResponse { Error = $"Unknown operation: {input.Payload.Operation}" }
        };
    }

    /// <summary>
    /// Resolves payload fields from either top-level or nested payload.
    /// The AppSync resolver sends: { operation, payload: { orderId, ... } }
    /// </summary>
    private static EventPayload ResolvePayload(EventPayload payload)
    {
        // If orderId is directly on the payload, use it
        if (!string.IsNullOrEmpty(payload.OrderId))
        {
            return payload;
        }

        // Otherwise check nested Data
        if (payload.Data != null && !string.IsNullOrEmpty(payload.Data.OrderId))
        {
            payload.OrderId = payload.Data.OrderId;
            payload.ProcessedBy = payload.Data.ProcessedBy ?? payload.ProcessedBy;
            payload.ProcessedAt = payload.Data.ProcessedAt ?? payload.ProcessedAt;
        }

        return payload;
    }

    /// <summary>
    /// Process an order: validate payment, check inventory, update status.
    /// </summary>
    private static OrderResponse ProcessOrder(EventPayload payload)
    {
        var orderId = payload.OrderId;
        if (string.IsNullOrEmpty(orderId))
        {
            return new OrderResponse { Error = "orderId is required" };
        }

        // Simulate payment validation
        var paymentValid = ValidatePayment(orderId);
        if (!paymentValid)
        {
            return new OrderResponse
            {
                Id = orderId,
                Status = "CANCELLED",
                Error = "Payment validation failed"
            };
        }

        // Simulate inventory check
        var inventoryAvailable = CheckInventory(orderId);
        if (!inventoryAvailable)
        {
            return new OrderResponse
            {
                Id = orderId,
                Status = "CANCELLED",
                Error = "Insufficient inventory"
            };
        }

        // Process the order
        var order = new Order
        {
            Id = orderId,
            Status = OrderStatus.PROCESSING,
            ProcessedAt = DateTime.UtcNow.ToString("o"),
            ProcessedBy = payload.ProcessedBy ?? "system"
        };

        _orders[orderId] = order;

        Console.Error.WriteLine($"[.NET Lambda] Order {orderId} processed successfully");

        return new OrderResponse
        {
            Id = order.Id,
            Status = order.Status.ToString(),
            UserId = "user-from-order",
            Items = new List<OrderItem>(),
            Total = 0,
            CreatedAt = order.ProcessedAt
        };
    }

    /// <summary>
    /// Get the current status of an order.
    /// </summary>
    private static OrderResponse GetOrderStatus(EventPayload payload)
    {
        var orderId = payload.OrderId;
        if (string.IsNullOrEmpty(orderId))
        {
            return new OrderResponse { Error = "orderId is required" };
        }

        if (_orders.TryGetValue(orderId, out var order))
        {
            return new OrderResponse
            {
                Id = order.Id,
                Status = order.Status.ToString()
            };
        }

        return new OrderResponse
        {
            Id = orderId,
            Status = "PENDING"
        };
    }

    /// <summary>
    /// Cancel an order if it hasn't been shipped yet.
    /// </summary>
    private static OrderResponse CancelOrder(EventPayload payload)
    {
        var orderId = payload.OrderId;
        if (string.IsNullOrEmpty(orderId))
        {
            return new OrderResponse { Error = "orderId is required" };
        }

        if (_orders.TryGetValue(orderId, out var order))
        {
            if (order.Status == OrderStatus.SHIPPED || order.Status == OrderStatus.DELIVERED)
            {
                return new OrderResponse
                {
                    Id = orderId,
                    Status = order.Status.ToString(),
                    Error = "Cannot cancel an order that has been shipped"
                };
            }

            order.Status = OrderStatus.CANCELLED;
            return new OrderResponse
            {
                Id = order.Id,
                Status = "CANCELLED"
            };
        }

        return new OrderResponse { Error = $"Order {orderId} not found" };
    }

    // Simulated payment validation
    private static bool ValidatePayment(string orderId) => true;

    // Simulated inventory check
    private static bool CheckInventory(string orderId) => true;
}

#region Models

public class AppSyncEvent
{
    [JsonPropertyName("typeName")]
    public string? TypeName { get; set; }

    [JsonPropertyName("fieldName")]
    public string? FieldName { get; set; }

    [JsonPropertyName("arguments")]
    public Dictionary<string, JsonElement>? Arguments { get; set; }

    [JsonPropertyName("identity")]
    public Identity? Identity { get; set; }

    [JsonPropertyName("payload")]
    public EventPayload? Payload { get; set; }
}

public class Identity
{
    [JsonPropertyName("sub")]
    public string? Sub { get; set; }

    [JsonPropertyName("username")]
    public string? Username { get; set; }
}

public class EventPayload
{
    [JsonPropertyName("operation")]
    public string? Operation { get; set; }

    [JsonPropertyName("payload")]
    public PayloadData? Data { get; set; }

    // Flattened fields from payload.payload for convenience
    [JsonPropertyName("orderId")]
    public string? OrderId { get; set; }

    [JsonPropertyName("processedBy")]
    public string? ProcessedBy { get; set; }

    [JsonPropertyName("processedAt")]
    public string? ProcessedAt { get; set; }
}

public class PayloadData
{
    [JsonPropertyName("orderId")]
    public string? OrderId { get; set; }

    [JsonPropertyName("processedBy")]
    public string? ProcessedBy { get; set; }

    [JsonPropertyName("processedAt")]
    public string? ProcessedAt { get; set; }
}

public class OrderResponse
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("userId")]
    public string? UserId { get; set; }

    [JsonPropertyName("items")]
    public List<OrderItem>? Items { get; set; }

    [JsonPropertyName("total")]
    public double Total { get; set; }

    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("createdAt")]
    public string? CreatedAt { get; set; }

    [JsonPropertyName("error")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Error { get; set; }
}

public class OrderItem
{
    [JsonPropertyName("productId")]
    public string? ProductId { get; set; }

    [JsonPropertyName("quantity")]
    public int Quantity { get; set; }

    [JsonPropertyName("price")]
    public double Price { get; set; }
}

public class Order
{
    public string Id { get; set; } = string.Empty;
    public OrderStatus Status { get; set; }
    public string? ProcessedAt { get; set; }
    public string? ProcessedBy { get; set; }
}

public enum OrderStatus
{
    PENDING,
    PROCESSING,
    SHIPPED,
    DELIVERED,
    CANCELLED
}

#endregion

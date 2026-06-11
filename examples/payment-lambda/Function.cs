using System.Text.Json;
using System.Text.Json.Serialization;

namespace PaymentLambda;

/// <summary>
/// Payment Service Lambda (.NET)
///
/// Handles charge and refund operations.
/// Invoked by the AppSync simulator as a Lambda datasource.
/// </summary>
public class Function
{
    // In-memory payment store for local simulation
    private static readonly Dictionary<string, Payment> _payments = new();

    public static PaymentResponse FunctionHandler(AppSyncEvent input)
    {
        Console.Error.WriteLine($"[PaymentLambda] Processing: {input.Payload?.Operation}");

        if (input.Payload == null)
            return new PaymentResponse { Error = "Missing payload" };

        var data = ResolveData(input.Payload);

        return input.Payload.Operation switch
        {
            "chargePayment"  => ChargePayment(data),
            "refundPayment"  => RefundPayment(data),
            "getPayment"     => GetPayment(data),
            "listPayments"   => throw new InvalidOperationException("listPayments should return a list"),
            _ => new PaymentResponse { Error = $"Unknown operation: {input.Payload.Operation}" }
        };
    }

    /// <summary>List handler — returns payments for an order.</summary>
    public static ListPaymentsResponse ListPaymentsFunctionHandler(AppSyncEvent input)
    {
        Console.Error.WriteLine($"[PaymentLambda] Processing: listPayments");

        var data = ResolveData(input.Payload!);
        var orderId = data.OrderId;

        if (string.IsNullOrEmpty(orderId))
            return new ListPaymentsResponse { Error = "orderId is required" };

        var result = _payments.Values
            .Where(p => p.OrderId == orderId)
            .OrderByDescending(p => p.CreatedAt)
            .Select(ToResponse)
            .ToList();

        return new ListPaymentsResponse { Items = result };
    }

    private static PayloadData ResolveData(EventPayload payload)
    {
        // Data is in payload.payload
        if (payload.Data != null) return payload.Data;

        // Fallback: map top-level fields
        return new PayloadData
        {
            PaymentId  = payload.PaymentId,
            OrderId    = payload.OrderId,
            Amount     = payload.Amount,
            Currency   = payload.Currency,
            PaymentMethod = payload.PaymentMethod,
            Reason     = payload.Reason,
        };
    }

    private static PaymentResponse ChargePayment(PayloadData data)
    {
        if (string.IsNullOrEmpty(data.OrderId))
            return new PaymentResponse { Error = "orderId is required" };
        if (data.Amount <= 0)
            return new PaymentResponse { Error = "amount must be positive" };
        if (string.IsNullOrEmpty(data.Currency))
            return new PaymentResponse { Error = "currency is required" };
        if (string.IsNullOrEmpty(data.PaymentMethod))
            return new PaymentResponse { Error = "paymentMethod is required" };

        // Simulate card decline for amounts > 10000
        if (data.Amount > 10000)
        {
            Console.Error.WriteLine($"[PaymentLambda] Charge declined: amount {data.Amount} exceeds limit");
            return new PaymentResponse
            {
                Id            = GenerateId(),
                OrderId       = data.OrderId,
                Amount        = data.Amount ?? 0,
                Currency      = data.Currency,
                Status        = "FAILED",
                PaymentMethod = data.PaymentMethod,
                CreatedAt     = DateTime.UtcNow.ToString("o"),
                Error         = "Payment declined: amount exceeds limit"
            };
        }

        var payment = new Payment
        {
            Id            = GenerateId(),
            OrderId       = data.OrderId,
            Amount        = data.Amount ?? 0,
            Currency      = data.Currency,
            Status        = PaymentStatus.COMPLETED,
            PaymentMethod = data.PaymentMethod,
            TransactionId = $"txn_{GenerateShortId()}",
            CreatedAt     = DateTime.UtcNow.ToString("o"),
        };

        _payments[payment.Id] = payment;
        Console.Error.WriteLine($"[PaymentLambda] Charged {data.Currency} {data.Amount} → {payment.Id}");

        return ToResponse(payment);
    }

    private static PaymentResponse RefundPayment(PayloadData data)
    {
        if (string.IsNullOrEmpty(data.PaymentId))
            return new PaymentResponse { Error = "paymentId is required" };

        if (!_payments.TryGetValue(data.PaymentId, out var payment))
            return new PaymentResponse { Error = $"Payment {data.PaymentId} not found" };

        if (payment.Status == PaymentStatus.REFUNDED)
            return new PaymentResponse { Error = "Payment already fully refunded" };

        if (payment.Status != PaymentStatus.COMPLETED && payment.Status != PaymentStatus.PARTIALLY_REFUNDED)
            return new PaymentResponse { Error = $"Cannot refund payment in status {payment.Status}" };

        var refundAmount = data.Amount ?? payment.Amount;

        if (refundAmount > payment.Amount)
            return new PaymentResponse { Error = $"Refund amount {refundAmount} exceeds payment amount {payment.Amount}" };

        payment.Status       = refundAmount < payment.Amount ? PaymentStatus.PARTIALLY_REFUNDED : PaymentStatus.REFUNDED;
        payment.RefundedAt   = DateTime.UtcNow.ToString("o");
        payment.RefundReason = data.Reason ?? "Customer request";

        Console.Error.WriteLine($"[PaymentLambda] Refunded {refundAmount} → {payment.Status}");
        return ToResponse(payment);
    }

    private static PaymentResponse GetPayment(PayloadData data)
    {
        if (string.IsNullOrEmpty(data.PaymentId))
            return new PaymentResponse { Error = "paymentId is required" };

        return _payments.TryGetValue(data.PaymentId, out var payment)
            ? ToResponse(payment)
            : new PaymentResponse { Error = $"Payment {data.PaymentId} not found" };
    }

    private static PaymentResponse ToResponse(Payment p) => new()
    {
        Id            = p.Id,
        OrderId       = p.OrderId,
        Amount        = p.Amount,
        Currency      = p.Currency,
        Status        = p.Status.ToString(),
        PaymentMethod = p.PaymentMethod,
        TransactionId = p.TransactionId,
        CreatedAt     = p.CreatedAt,
        RefundedAt    = p.RefundedAt,
        RefundReason  = p.RefundReason,
    };

    private static string GenerateId() =>
        Guid.NewGuid().ToString();

    private static string GenerateShortId() =>
        Guid.NewGuid().ToString("N")[..8];
}

#region Models

public class AppSyncEvent
{
    [JsonPropertyName("typeName")]   public string?      TypeName  { get; set; }
    [JsonPropertyName("fieldName")]  public string?      FieldName { get; set; }
    [JsonPropertyName("identity")]   public Identity?    Identity  { get; set; }
    [JsonPropertyName("payload")]    public EventPayload? Payload  { get; set; }
}

public class Identity
{
    [JsonPropertyName("sub")]      public string? Sub      { get; set; }
    [JsonPropertyName("username")] public string? Username { get; set; }
}

public class EventPayload
{
    [JsonPropertyName("operation")]    public string?      Operation     { get; set; }
    [JsonPropertyName("payload")]      public PayloadData? Data          { get; set; }

    // Flattened from payload.payload for convenience
    [JsonPropertyName("paymentId")]    public string?  PaymentId    { get; set; }
    [JsonPropertyName("orderId")]      public string?  OrderId      { get; set; }
    [JsonPropertyName("amount")]       public double   Amount       { get; set; }
    [JsonPropertyName("currency")]     public string?  Currency     { get; set; }
    [JsonPropertyName("paymentMethod")] public string? PaymentMethod { get; set; }
    [JsonPropertyName("reason")]       public string?  Reason       { get; set; }
}

public class PayloadData
{
    [JsonPropertyName("paymentId")]    public string?  PaymentId    { get; set; }
    [JsonPropertyName("orderId")]      public string?  OrderId      { get; set; }
    [JsonPropertyName("amount")]       public double?  Amount       { get; set; }
    [JsonPropertyName("currency")]     public string?  Currency     { get; set; }
    [JsonPropertyName("paymentMethod")] public string? PaymentMethod { get; set; }
    [JsonPropertyName("reason")]       public string?  Reason       { get; set; }
}

public class Payment
{
    public string          Id            { get; set; } = string.Empty;
    public string          OrderId       { get; set; } = string.Empty;
    public double          Amount        { get; set; }
    public string          Currency      { get; set; } = "USD";
    public PaymentStatus   Status        { get; set; }
    public string          PaymentMethod { get; set; } = string.Empty;
    public string?         TransactionId { get; set; }
    public string          CreatedAt     { get; set; } = string.Empty;
    public string?         RefundedAt    { get; set; }
    public string?         RefundReason  { get; set; }
}

public enum PaymentStatus { PENDING, COMPLETED, FAILED, REFUNDED, PARTIALLY_REFUNDED }

public class PaymentResponse
{
    [JsonPropertyName("id")]            public string? Id            { get; set; }
    [JsonPropertyName("orderId")]       public string? OrderId       { get; set; }
    [JsonPropertyName("amount")]        public double  Amount        { get; set; }
    [JsonPropertyName("currency")]      public string? Currency      { get; set; }
    [JsonPropertyName("status")]        public string? Status        { get; set; }
    [JsonPropertyName("paymentMethod")] public string? PaymentMethod { get; set; }
    [JsonPropertyName("transactionId")] public string? TransactionId { get; set; }
    [JsonPropertyName("createdAt")]     public string? CreatedAt     { get; set; }
    [JsonPropertyName("refundedAt")]    public string? RefundedAt    { get; set; }
    [JsonPropertyName("refundReason")]  public string? RefundReason  { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [JsonPropertyName("error")]         public string? Error         { get; set; }
}

public class ListPaymentsResponse
{
    [JsonPropertyName("items")] public List<PaymentResponse>? Items { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    [JsonPropertyName("error")] public string? Error { get; set; }
}

#endregion

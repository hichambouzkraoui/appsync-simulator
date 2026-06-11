using System.Text.Json;
using PaymentLambda;

var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
var writeOptions = new JsonSerializerOptions
{
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
};

string Invoke(string line)
{
    var ev = JsonSerializer.Deserialize<AppSyncEvent>(line, options);
    if (ev == null) return JsonSerializer.Serialize(new PaymentResponse { Error = "Deserialization failed" }, writeOptions);

    if (ev.Payload?.Operation == "listPayments")
        return JsonSerializer.Serialize(Function.ListPaymentsFunctionHandler(ev), writeOptions);

    return JsonSerializer.Serialize(Function.FunctionHandler(ev), writeOptions);
}

// ── Persistent mode ──────────────────────────────────────────────────────────
if (Environment.GetEnvironmentVariable("LAMBDA_PERSISTENT") == "1")
{
    Console.WriteLine("__READY__");
    Console.Out.Flush();

    while (Console.ReadLine() is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        try
        {
            Console.WriteLine(Invoke(line));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PaymentLambda] Error: {ex.Message}");
            Console.WriteLine(JsonSerializer.Serialize(new PaymentResponse { Error = ex.Message }, writeOptions));
        }
        Console.Out.Flush();
    }
    return;
}

// ── Single-invocation mode ───────────────────────────────────────────────────
var eventJson = Environment.GetEnvironmentVariable("LAMBDA_EVENT");
if (string.IsNullOrEmpty(eventJson))
{
    using var reader = new StreamReader(Console.OpenStandardInput());
    eventJson = await reader.ReadToEndAsync();
}

if (string.IsNullOrEmpty(eventJson))
{
    Console.WriteLine(JsonSerializer.Serialize(new PaymentResponse { Error = "No event data received" }, writeOptions));
    return;
}

try
{
    Console.WriteLine(Invoke(eventJson));
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[PaymentLambda] Unhandled: {ex.Message}");
    Console.WriteLine(JsonSerializer.Serialize(new PaymentResponse { Error = ex.Message }, writeOptions));
}

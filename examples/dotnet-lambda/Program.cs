using System.Text.Json;
using DotnetLambda;

var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
var writeOptions = new JsonSerializerOptions
{
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
};

// ── Persistent mode: read one JSON line per invocation, write one JSON line back ──
if (Environment.GetEnvironmentVariable("LAMBDA_PERSISTENT") == "1")
{
    Console.WriteLine("__READY__");
    Console.Out.Flush();

    while (Console.ReadLine() is { } line)
    {
        if (string.IsNullOrWhiteSpace(line)) continue;
        try
        {
            var ev = JsonSerializer.Deserialize<AppSyncEvent>(line, options);
            var result = ev != null ? Function.FunctionHandler(ev) : new OrderResponse { Error = "Deserialization failed" };
            Console.WriteLine(JsonSerializer.Serialize(result, writeOptions));
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[OrderProcessor] Error: {ex.Message}");
            Console.WriteLine(JsonSerializer.Serialize(new OrderResponse { Error = ex.Message }, writeOptions));
        }
        Console.Out.Flush();
    }
    return;
}

// ── Single-invocation mode (used by dotnet run without LAMBDA_PERSISTENT) ──
var eventJson = Environment.GetEnvironmentVariable("LAMBDA_EVENT");
if (string.IsNullOrEmpty(eventJson))
{
    using var reader = new StreamReader(Console.OpenStandardInput());
    eventJson = await reader.ReadToEndAsync();
}

if (string.IsNullOrEmpty(eventJson))
{
    Console.WriteLine(JsonSerializer.Serialize(new OrderResponse { Error = "No event data received" }, writeOptions));
    return;
}

try
{
    var appSyncEvent = JsonSerializer.Deserialize<AppSyncEvent>(eventJson, options);
    var result = appSyncEvent != null ? Function.FunctionHandler(appSyncEvent) : new OrderResponse { Error = "Deserialization failed" };
    Console.WriteLine(JsonSerializer.Serialize(result, writeOptions));
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[OrderProcessor] Unhandled: {ex.Message}");
    Console.WriteLine(JsonSerializer.Serialize(new OrderResponse { Error = ex.Message }, writeOptions));
}

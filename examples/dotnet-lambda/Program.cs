using System.Text.Json;
using DotnetLambda;

// Standard Lambda entry point — reads event, invokes handler, writes response.
// No awareness of the simulator's hosting protocol.

var eventJson = Environment.GetEnvironmentVariable("LAMBDA_EVENT");

if (string.IsNullOrEmpty(eventJson))
{
    using var reader = new StreamReader(Console.OpenStandardInput());
    eventJson = await reader.ReadToEndAsync();
}

if (string.IsNullOrEmpty(eventJson))
{
    Console.WriteLine(JsonSerializer.Serialize(new OrderResponse { Error = "No event data received" }));
    return;
}

try
{
    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    var appSyncEvent = JsonSerializer.Deserialize<AppSyncEvent>(eventJson, options)!;
    var result = Function.FunctionHandler(appSyncEvent);

    Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    }));
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[OrderProcessor] Error: {ex.Message}");
    Console.WriteLine(JsonSerializer.Serialize(new OrderResponse { Error = ex.Message }));
}

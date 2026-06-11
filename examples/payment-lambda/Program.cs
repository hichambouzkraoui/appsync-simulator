using System.Text.Json;
using PaymentLambda;

// Standard Lambda entry point — reads event, invokes handler, writes response.

var eventJson = Environment.GetEnvironmentVariable("LAMBDA_EVENT");

if (string.IsNullOrEmpty(eventJson))
{
    using var reader = new StreamReader(Console.OpenStandardInput());
    eventJson = await reader.ReadToEndAsync();
}

if (string.IsNullOrEmpty(eventJson))
{
    Console.WriteLine(JsonSerializer.Serialize(new PaymentResponse { Error = "No event data received" }));
    return;
}

try
{
    var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
    var writeOptions = new JsonSerializerOptions
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    var appSyncEvent = JsonSerializer.Deserialize<AppSyncEvent>(eventJson, options)!;
    var result = Function.FunctionHandler(appSyncEvent);
    Console.WriteLine(JsonSerializer.Serialize(result, writeOptions));
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[PaymentLambda] Error: {ex.Message}");
    Console.WriteLine(JsonSerializer.Serialize(new PaymentResponse { Error = ex.Message }));
}

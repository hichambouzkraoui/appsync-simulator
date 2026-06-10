using System.Text.Json;
using DotnetLambda;

/// <summary>
/// Entry point for the .NET Lambda.
/// Reads the event from the LAMBDA_EVENT environment variable or stdin,
/// invokes the handler, and writes the JSON response to stdout.
/// </summary>

var eventJson = Environment.GetEnvironmentVariable("LAMBDA_EVENT");

if (string.IsNullOrEmpty(eventJson))
{
    using var reader = new StreamReader(Console.OpenStandardInput());
    eventJson = await reader.ReadToEndAsync();
}

if (string.IsNullOrEmpty(eventJson))
{
    Console.Error.WriteLine("[.NET Lambda] Error: No event data received");
    var errorResponse = JsonSerializer.Serialize(new OrderResponse { Error = "No event data received" });
    Console.WriteLine(errorResponse);
    return;
}

try
{
    var options = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    };

    var appSyncEvent = JsonSerializer.Deserialize<AppSyncEvent>(eventJson, options);

    if (appSyncEvent == null)
    {
        Console.Error.WriteLine("[.NET Lambda] Error: Failed to deserialize event");
        var errorResponse = JsonSerializer.Serialize(new OrderResponse { Error = "Failed to deserialize event" });
        Console.WriteLine(errorResponse);
        return;
    }

    var result = Function.FunctionHandler(appSyncEvent);

    var responseJson = JsonSerializer.Serialize(result, new JsonSerializerOptions
    {
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    });

    Console.WriteLine(responseJson);
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[.NET Lambda] Unhandled exception: {ex.Message}");
    var errorResponse = JsonSerializer.Serialize(new OrderResponse { Error = ex.Message });
    Console.WriteLine(errorResponse);
}

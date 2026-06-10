using System.Text.Json;
using DotnetLambda;

/// <summary>
/// Debug host for the .NET Lambda — a minimal HTTP server that receives
/// AppSync events and invokes the Lambda handler.
///
/// The IDE launches this with the debugger attached from the start.
/// Breakpoints in Function.cs work immediately.
/// </summary>

var port = Environment.GetEnvironmentVariable("LAMBDA_DEBUG_PORT") 
    ?? (args.Length > 0 ? args[0] : "5050");

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls($"http://localhost:{port}");
builder.Logging.SetMinimumLevel(LogLevel.Warning);

var app = builder.Build();

var debuggerChecked = false;
var jsonReadOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
var jsonWriteOptions = new JsonSerializerOptions
{
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
};

app.MapPost("/invoke", async (HttpContext ctx) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var eventJson = await reader.ReadToEndAsync();

    // On first request, wait for debugger if WAIT_FOR_DEBUGGER is set
    if (!debuggerChecked && Environment.GetEnvironmentVariable("DOTNET_LAMBDA_WAIT_FOR_DEBUGGER") == "1")
    {
        debuggerChecked = true;
        if (!System.Diagnostics.Debugger.IsAttached)
        {
            Console.WriteLine($"[DebugHost] ⏸️  Waiting for debugger... (PID: {Environment.ProcessId})");
            Console.WriteLine($"[DebugHost]    Run & Debug → pick \"DebugHost\" to attach");
            while (!System.Diagnostics.Debugger.IsAttached)
            {
                await Task.Delay(100);
            }
            Console.WriteLine($"[DebugHost] ✅ Debugger attached! Processing request...");
        }
    }

    try
    {
        var appSyncEvent = JsonSerializer.Deserialize<AppSyncEvent>(eventJson, jsonReadOptions);

        if (appSyncEvent == null)
        {
            ctx.Response.StatusCode = 400;
            await ctx.Response.WriteAsJsonAsync(new { error = "Failed to deserialize event" });
            return;
        }

        // >>> SET BREAKPOINTS IN Function.cs — THEY WILL HIT HERE <<<
        var result = Function.FunctionHandler(appSyncEvent);

        var responseJson = JsonSerializer.Serialize(result, jsonWriteOptions);
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(responseJson);
    }
    catch (Exception ex)
    {
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsJsonAsync(new { error = ex.Message });
    }
});

app.MapGet("/health", () => Results.Ok(new { status = "ready" }));

Console.WriteLine($"[DebugHost] Lambda debug server on http://localhost:{port}");
Console.WriteLine($"[DebugHost] Breakpoints in Function.cs are active");
Console.WriteLine($"[DebugHost] PID: {Environment.ProcessId}");

// Write PID to file so the IDE can auto-attach
var pidFilePath = Environment.GetEnvironmentVariable("DEBUGHOST_PID_FILE");
if (!string.IsNullOrEmpty(pidFilePath))
{
    File.WriteAllText(pidFilePath, Environment.ProcessId.ToString());
}

app.Run();

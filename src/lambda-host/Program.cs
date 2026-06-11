using System.Reflection;
using System.Text.Json;

/// <summary>
/// Generic Lambda Host — runs any .NET Lambda in persistent mode.
///
/// Usage: LambdaHost &lt;path-to-lambda-dll&gt; &lt;handler-string&gt;
///   handler-string format: Assembly::Namespace.Class::MethodName
///
/// Protocol:
///   - Prints __READY__ to stdout when loaded
///   - Reads one JSON line per invocation from stdin
///   - Invokes the handler method with the deserialized event
///   - Writes one JSON line response to stdout
///
/// The Lambda code does NOT need any modifications or awareness of this host.
/// </summary>

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: LambdaHost <lambda-dll-path> <handler>");
    Console.Error.WriteLine("  handler format: Assembly::Namespace.Class::MethodName");
    return 1;
}

var dllPath = args[0];
var handlerString = args[1];

// Parse handler: Assembly::Namespace.Class::MethodName
var parts = handlerString.Split("::");
if (parts.Length != 3)
{
    Console.Error.WriteLine($"Invalid handler format: {handlerString}");
    Console.Error.WriteLine("Expected: Assembly::Namespace.Class::MethodName");
    return 1;
}

var assemblyName = parts[0];
var typeName = parts[1];
var methodName = parts[2];

// Load the Lambda assembly
var assembly = Assembly.LoadFrom(dllPath);
var type = assembly.GetType(typeName);
if (type == null)
{
    Console.Error.WriteLine($"Type not found: {typeName} in {dllPath}");
    return 1;
}

var method = type.GetMethod(methodName, BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance);
if (method == null)
{
    Console.Error.WriteLine($"Method not found: {methodName} on {typeName}");
    return 1;
}

// Determine the input parameter type
var parameters = method.GetParameters();
if (parameters.Length == 0)
{
    Console.Error.WriteLine($"Handler method must have at least one parameter");
    return 1;
}
var inputType = parameters[0].ParameterType;

// Create instance if method is not static
object? instance = null;
if (!method.IsStatic)
{
    instance = Activator.CreateInstance(type);
}

var jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
var writeOptions = new JsonSerializerOptions
{
    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
};

// Signal ready
Console.WriteLine("__READY__");
Console.Out.Flush();

// Persistent loop
while (Console.ReadLine() is { } line)
{
    if (string.IsNullOrWhiteSpace(line)) continue;

    try
    {
        var input = JsonSerializer.Deserialize(line, inputType, jsonOptions);
        var result = method.Invoke(instance, new[] { input });

        // Handle async methods
        if (result is Task task)
        {
            await task;
            // Get the result from Task<T>
            var taskType = task.GetType();
            if (taskType.IsGenericType)
            {
                var resultProperty = taskType.GetProperty("Result");
                result = resultProperty?.GetValue(task);
            }
            else
            {
                result = null;
            }
        }

        var json = JsonSerializer.Serialize(result, writeOptions);
        Console.WriteLine(json);
    }
    catch (TargetInvocationException ex)
    {
        var inner = ex.InnerException ?? ex;
        Console.Error.WriteLine($"[LambdaHost] Handler error: {inner.Message}");
        Console.WriteLine(JsonSerializer.Serialize(new { error = inner.Message }, writeOptions));
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"[LambdaHost] Error: {ex.Message}");
        Console.WriteLine(JsonSerializer.Serialize(new { error = ex.Message }, writeOptions));
    }

    Console.Out.Flush();
}

return 0;

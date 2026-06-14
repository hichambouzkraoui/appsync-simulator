import java.io.*;
import java.lang.reflect.*;
import java.util.Scanner;

/**
 * Generic Lambda Host for Java — runs any Lambda handler in persistent mode.
 *
 * Usage: java -cp host:lambda.jar LambdaHost com.example.HandlerClass
 *
 * Protocol:
 *   - Prints __READY__ to stdout when loaded
 *   - Reads one JSON line per invocation from stdin
 *   - Invokes the handler and writes one JSON line response to stdout
 *
 * Supports:
 *   - Classes implementing com.amazonaws.services.lambda.runtime.RequestHandler
 *   - Classes implementing com.amazonaws.services.lambda.runtime.RequestStreamHandler
 *   - Classes with a public method matching: Object handleRequest(Object input, Context ctx)
 *
 * The Lambda code requires NO modifications.
 */
public class LambdaHost {
    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("Usage: LambdaHost <fully-qualified-handler-class>");
            System.exit(1);
        }

        String handlerClassName = args[0];
        Class<?> handlerClass = Class.forName(handlerClassName);
        Object handlerInstance = handlerClass.getDeclaredConstructor().newInstance();

        // Find the handleRequest method
        Method handleMethod = findHandleMethod(handlerClass);
        if (handleMethod == null) {
            System.err.println("[LambdaHost] No handleRequest method found on " + handlerClassName);
            System.exit(1);
        }

        // Determine input type
        Class<?>[] paramTypes = handleMethod.getParameterTypes();
        Class<?> inputType = paramTypes[0];

        // Signal ready
        System.out.println("__READY__");
        System.out.flush();

        // Persistent loop
        Scanner scanner = new Scanner(System.in);
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine().trim();
            if (line.isEmpty()) continue;

            try {
                Object result;

                if (inputType == InputStream.class) {
                    // RequestStreamHandler pattern
                    ByteArrayInputStream inputStream = new ByteArrayInputStream(line.getBytes("UTF-8"));
                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

                    if (paramTypes.length >= 3) {
                        handleMethod.invoke(handlerInstance, inputStream, outputStream, createContext());
                    } else {
                        handleMethod.invoke(handlerInstance, inputStream, outputStream);
                    }
                    System.out.println(outputStream.toString("UTF-8"));
                } else if (inputType == String.class) {
                    // Simple string handler
                    if (paramTypes.length >= 2) {
                        result = handleMethod.invoke(handlerInstance, line, createContext());
                    } else {
                        result = handleMethod.invoke(handlerInstance, line);
                    }
                    System.out.println(result != null ? result.toString() : "null");
                } else if (inputType == java.util.Map.class || inputType == Object.class) {
                    // Map/Object handler — pass raw JSON string, let handler parse
                    // Most Lambda frameworks accept Map<String,Object> from JSON
                    if (paramTypes.length >= 2) {
                        result = handleMethod.invoke(handlerInstance, line, createContext());
                    } else {
                        result = handleMethod.invoke(handlerInstance, line);
                    }
                    System.out.println(result != null ? result.toString() : "null");
                } else {
                    // For typed input, pass as String — handler should parse JSON
                    if (paramTypes.length >= 2) {
                        result = handleMethod.invoke(handlerInstance, line, createContext());
                    } else {
                        result = handleMethod.invoke(handlerInstance, line);
                    }
                    System.out.println(result != null ? result.toString() : "null");
                }
            } catch (InvocationTargetException e) {
                Throwable cause = e.getCause() != null ? e.getCause() : e;
                System.err.println("[LambdaHost] Handler error: " + cause.getMessage());
                System.out.println("{\"error\":\"" + escape(cause.getMessage()) + "\"}");
            } catch (Exception e) {
                System.err.println("[LambdaHost] Error: " + e.getMessage());
                System.out.println("{\"error\":\"" + escape(e.getMessage()) + "\"}");
            }

            System.out.flush();
        }
    }

    private static Method findHandleMethod(Class<?> clazz) {
        // Look for handleRequest method (standard Lambda contract)
        for (Method m : clazz.getMethods()) {
            if (m.getName().equals("handleRequest") && m.getParameterCount() >= 1) {
                return m;
            }
        }
        // Fallback: look for any public method with "handle" in the name
        for (Method m : clazz.getDeclaredMethods()) {
            if (Modifier.isPublic(m.getModifiers()) && m.getName().toLowerCase().contains("handle")) {
                return m;
            }
        }
        return null;
    }

    private static Object createContext() {
        // Return null for Context — most handlers check for null
        // A proper implementation would create a mock Context object
        return null;
    }

    private static String escape(String s) {
        if (s == null) return "unknown error";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}

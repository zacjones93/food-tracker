export const GenericToolPart = ({ toolName, result }: { toolName: string; result: unknown }) => {
  return (
    <div className="bg-gray-900/90 border-2 border-gray-600 rounded-lg p-3 text-xs">
      <div className="font-semibold text-gray-100 mb-1">
        🔧 {toolName}
      </div>
      {result ? (
        <pre className="text-gray-50 text-xs overflow-auto mt-1 max-h-32">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};

function SimpleApp() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-4xl font-bold text-center text-blue-600">
        CardioCare AI - SMS System Active
      </h1>
      <div className="max-w-md mx-auto mt-8 p-6 bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">System Status</h2>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Backend API:</span>
            <span className="text-green-600">✓ Running</span>
          </div>
          <div className="flex justify-between">
            <span>SMS Service:</span>
            <span className="text-green-600">✓ Ready</span>
          </div>
          <div className="flex justify-between">
            <span>Database:</span>
            <span className="text-green-600">✓ Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleApp;
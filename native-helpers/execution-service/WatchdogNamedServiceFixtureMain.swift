import Dispatch

@main
enum WatchdogNamedServiceFixtureMain {
    static func main() throws {
        let listener = try WatchdogNamedListenerTransportCandidate.makeActivatedListener()
        withExtendedLifetime(listener) {
            dispatchMain()
        }
    }
}

import ServiceManagement

enum WatchdogLaunchAgentStatusObservation: String, CaseIterable {
    case notRegistered = "NOT_REGISTERED"
    case enabled = "ENABLED"
    case requiresApproval = "REQUIRES_APPROVAL"
    case notFound = "NOT_FOUND"
}

enum WatchdogLaunchAgentStatusCandidate {
    private static let plistName =
        "com.socialeap.dosai.execution-service-fixture.plist"

    static func observe() -> WatchdogLaunchAgentStatusObservation {
        switch SMAppService.agent(plistName: plistName).status {
        case .notRegistered:
            return .notRegistered
        case .enabled:
            return .enabled
        case .requiresApproval:
            return .requiresApproval
        case .notFound:
            return .notFound
        @unknown default:
            return .notFound
        }
    }
}

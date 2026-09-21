import XPC

enum WatchdogNamedListenerCandidateError: Error {
    case peerRequirementRejected
}

enum WatchdogNamedListenerCandidate {
    static let futureExecutableIdentifier = "com.socialeap.dosai.execution-service-fixture"
    static let machServiceIdentifier = "com.socialeap.dosai.execution-service-fixture.watchdog"
    static let expectedClientIdentifier = "com.socialeap.dosai"
    static let expectedTeamIdentifier = "3RD3TADLRY"

    private static let expectedClientRequirement =
        "anchor apple generic and certificate leaf[subject.OU] = \"\(expectedTeamIdentifier)\" "
        + "and identifier \"\(expectedClientIdentifier)\""

    static func makeInactiveListener() throws -> xpc_connection_t {
        let listener = xpc_connection_create_mach_service(
            machServiceIdentifier,
            nil,
            UInt64(XPC_CONNECTION_MACH_SERVICE_LISTENER)
        )
        guard xpc_connection_set_peer_code_signing_requirement(
            listener,
            expectedClientRequirement
        ) == 0 else {
            xpc_connection_cancel(listener)
            throw WatchdogNamedListenerCandidateError.peerRequirementRejected
        }
        return listener
    }
}

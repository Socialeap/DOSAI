import Foundation

private let requestIDs = [
    "55555555-5555-4555-8555-555555555551",
    "55555555-5555-4555-8555-555555555552",
    "55555555-5555-4555-8555-555555555553",
    "55555555-5555-4555-8555-555555555554",
    "55555555-5555-4555-8555-555555555555",
    "55555555-5555-4555-8555-555555555556",
    "55555555-5555-4555-8555-555555555557",
    "55555555-5555-4555-8555-555555555558",
    "55555555-5555-4555-8555-555555555559",
    "55555555-5555-4555-8555-55555555555a",
]

private func isRejected(_ submission: WatchdogSubmission, code: String) -> Bool {
    if case let .rejected(actual) = submission { return actual == code }
    return false
}

private func describe() -> [String: Any] {
    [
        "schema": "DOSAI_WATCHDOG_CONTROL_FIXTURE_V1",
        "ok": true,
        "result": [
            "application_reachable": false,
            "external_mutation_authority": false,
            "filesystem_authority": false,
            "generic_payload_authority": false,
            "helper_id": "com.socialeap.dosai.watchdog-control-fixture",
            "journal_authority": false,
            "minimum_macos_version": "15.0",
            "network_authority": false,
            "operations": ["describe", "self-test"],
            "process_launch_authority": false,
            "production_registration_authority": false,
            "protocol_version": 1,
            "stdin_consumed": false,
            "transport_implemented": false,
            "virtual_machine_authority": false,
        ],
    ]
}

private func selfTest() -> [String: Any] {
    let capsuleID = InertWatchdogControlCore.defaultCapsules()[0].capsuleID

    let strictCore = InertWatchdogControlCore()
    let unknownFieldRejected = isRejected(
        strictCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[0],
            sequence: 1,
            operation: .inspect,
            extra: ["pid": 123]
        )),
        code: "DOSAI_WATCHDOG_SCHEMA_0001"
    )
    let startPayload: [String: Any] = [
        "schema_id": InertWatchdogControlCore.schemaID,
        "schema_version": 1,
        "request_id": requestIDs[0],
        "session_id": InertWatchdogControlCore.sessionID,
        "service_boot_id": InertWatchdogControlCore.serviceBootID,
        "service_generation": InertWatchdogControlCore.serviceGeneration,
        "sequence": "1",
        "operation": "START",
        "supervisor_generation": InertWatchdogControlCore.supervisorGeneration,
        "authorization": "NO_EFFECT_TEST_ONLY",
    ]
    let startRejected = isRejected(
        strictCore.submit(startPayload),
        code: "DOSAI_WATCHDOG_SCHEMA_0001"
    )
    let executionAuthorizationRejected = isRejected(
        strictCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[0],
            sequence: 1,
            operation: .inspect,
            extra: ["authorization": "EXECUTION_ALLOWED"]
        )),
        code: "DOSAI_WATCHDOG_SCHEMA_0001"
    )
    let pathRejected = isRejected(
        strictCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[0],
            sequence: 1,
            operation: .inspect,
            extra: ["path": "/tmp/not-accepted"]
        )),
        code: "DOSAI_WATCHDOG_SCHEMA_0001"
    )

    let priorityCore = InertWatchdogControlCore()
    let inspectQueued = priorityCore.submit(watchdogFixtureRequest(
        requestID: requestIDs[0], sequence: 1, operation: .inspect
    ))
    let stopOneQueued = priorityCore.submit(watchdogFixtureRequest(
        requestID: requestIDs[1],
        sequence: 2,
        operation: .stopOne,
        capsuleID: capsuleID,
        reason: "OWNER_REQUEST"
    ))
    let stopAllQueued = priorityCore.submit(watchdogFixtureRequest(
        requestID: requestIDs[2],
        sequence: 3,
        operation: .stopAll,
        reason: "EMERGENCY_STOP"
    ))
    let priorityOrder = [
        priorityCore.drainNext()?.operation.rawValue,
        priorityCore.drainNext()?.operation.rawValue,
        priorityCore.drainNext()?.operation.rawValue,
    ].compactMap { $0 }
    let queuePriorityPassed = {
        guard case .queued = inspectQueued,
              case .queued = stopOneQueued,
              case .queued = stopAllQueued
        else { return false }
        return priorityOrder == ["STOP_ALL", "STOP_ONE", "INSPECT"]
    }()

    let replayCore = InertWatchdogControlCore()
    let replayPayload = watchdogFixtureRequest(
        requestID: requestIDs[3],
        sequence: 1,
        operation: .stopOne,
        capsuleID: capsuleID,
        reason: "OWNER_REQUEST"
    )
    let initialQueued = replayCore.submit(replayPayload)
    let initialCompletion = replayCore.drainNext()
    let replayResult = replayCore.submit(replayPayload)
    let identicalReplayReturnedCachedIdentity = {
        guard case .queued = initialQueued,
              let initialCompletion,
              case let .replayed(responseID) = replayResult
        else { return false }
        return responseID == initialCompletion.responseID
    }()
    var changedReplay = replayPayload
    changedReplay["reason"] = "WATCHDOG_TIMEOUT"
    let changedReuseRejected = isRejected(
        replayCore.submit(changedReplay),
        code: "DOSAI_WATCHDOG_REPLAY_0001"
    )
    let changedReuseClosedSession = changedReuseRejected
        && !replayCore.sessionOpen
        && replayCore.drainNext()?.operation == .stopAll

    let disconnectCore = InertWatchdogControlCore()
    _ = disconnectCore.submit(watchdogFixtureRequest(
        requestID: requestIDs[4], sequence: 1, operation: .inspect
    ))
    disconnectCore.disconnect()
    let disconnectCompletion = disconnectCore.drainNext()
    let disconnectedAdmissionRejected = isRejected(
        disconnectCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[5], sequence: 2, operation: .inspect
        )),
        code: "DOSAI_WATCHDOG_UNAVAILABLE_0001"
    )
    let disconnectReducedAll = disconnectCompletion?.operation == .stopAll
        && disconnectCore.capsules.allSatisfy { $0.state.isTerminal }

    let boundedCore = InertWatchdogControlCore()
    var boundedInspectAccepted = true
    for index in 0..<8 {
        let submission = boundedCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[index],
            sequence: UInt64(index + 1),
            operation: .inspect
        ))
        if case .queued = submission {} else { boundedInspectAccepted = false }
    }
    let inspectOverflowRejected = isRejected(
        boundedCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[8], sequence: 9, operation: .inspect
        )),
        code: "DOSAI_WATCHDOG_QUEUE_0001"
    )
    let reservedStopAllAccepted = {
        let submission = boundedCore.submit(watchdogFixtureRequest(
            requestID: requestIDs[9],
            sequence: 9,
            operation: .stopAll,
            reason: "EMERGENCY_STOP"
        ))
        if case .queued = submission { return true }
        return false
    }()
    let reservedStopAllRanFirst = boundedCore.drainNext()?.operation == .stopAll

    let uncertainCapsuleID = "66666666-6666-4666-8666-666666666666"
    let quarantineCore = InertWatchdogControlCore(capsules: [
        FixtureCapsule(
            capsuleID: uncertainCapsuleID,
            supervisorGeneration: InertWatchdogControlCore.supervisorGeneration,
            state: .quarantined
        ),
    ])
    _ = quarantineCore.submit(watchdogFixtureRequest(
        requestID: requestIDs[0],
        sequence: 1,
        operation: .stopOne,
        capsuleID: uncertainCapsuleID,
        reason: "OWNER_REQUEST"
    ))
    let uncertainCleanupRemainsQuarantined = {
        guard let completion = quarantineCore.drainNext() else { return false }
        return completion.disposition == "QUARANTINED"
            && quarantineCore.capsules[0].state == .quarantined
    }()

    let checks: [String: Bool] = [
        "changed_request_reuse_closed_session": changedReuseClosedSession,
        "disconnect_closed_admission": disconnectedAdmissionRejected,
        "disconnect_scheduled_stop_all": disconnectReducedAll,
        "execution_authorization_rejected": executionAuthorizationRejected,
        "identical_replay_returned_cached_identity": identicalReplayReturnedCachedIdentity,
        "inspect_queue_bound_enforced": boundedInspectAccepted && inspectOverflowRejected,
        "path_field_rejected": pathRejected,
        "priority_order_enforced": queuePriorityPassed,
        "reserved_stop_all_capacity_preserved": reservedStopAllAccepted && reservedStopAllRanFirst,
        "start_operation_rejected": startRejected,
        "uncertain_cleanup_remained_quarantined": uncertainCleanupRemainsQuarantined,
        "unknown_field_rejected": unknownFieldRejected,
    ]

    return [
        "schema": "DOSAI_WATCHDOG_CONTROL_FIXTURE_V1",
        "ok": checks.values.allSatisfy { $0 },
        "result": [
            "checks": checks,
            "external_mutation_performed": false,
            "fixture_records_mutated": true,
            "priority_order": priorityOrder,
            "transport_implemented": false,
        ],
    ]
}

private func writeJSON(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0a]))
}

@main
enum WatchdogControlFixture {
    static func main() {
        let arguments = CommandLine.arguments
        guard arguments.count == 2 else {
            writeJSON([
                "schema": "DOSAI_WATCHDOG_CONTROL_FIXTURE_V1",
                "ok": false,
                "error": ["code": "DOSAI_WATCHDOG_FIXTURE_PROTOCOL_0001"],
            ])
            exit(64)
        }
        switch arguments[1] {
        case "describe":
            writeJSON(describe())
        case "self-test":
            let report = selfTest()
            writeJSON(report)
            if report["ok"] as? Bool != true { exit(1) }
        default:
            writeJSON([
                "schema": "DOSAI_WATCHDOG_CONTROL_FIXTURE_V1",
                "ok": false,
                "error": ["code": "DOSAI_WATCHDOG_FIXTURE_PROTOCOL_0001"],
            ])
            exit(64)
        }
    }
}

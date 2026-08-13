import ExpoModulesCore
import UIKit
import DeclaredAgeRange

public final class ExpoDeclaredAgeRangeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoDeclaredAgeRange")

    AsyncFunction("requestAgeRangeAsync") { (gates: [Int], promise: Promise) in
      guard gates.count == 2 else {
        promise.reject("ERR_INVALID_GATES", "Exactly two age gates are required")
        return
      }
      guard #available(iOS 26.0, *) else {
        promise.resolve(["status": "unavailable"])
        return
      }
      guard let viewController = self.appContext?.utilities?.currentViewController() else {
        promise.resolve(["status": "unavailable"])
        return
      }

      Task { @MainActor in
        do {
          let service = AgeRangeService.shared
          var eligible = false
          var regulatoryFeatures: [String] = []
          if #available(iOS 26.2, *) {
            eligible = try await service.isEligibleForAgeFeatures
          }
          if #available(iOS 26.4, *) {
            regulatoryFeatures = try await service.requiredRegulatoryFeatures.map {
              String(describing: $0)
            }
          }
          let response = try await service.requestAgeRange(
            ageGates: gates[0], gates[1], nil, in: viewController
          )
          switch response {
          case .declinedSharing:
            promise.resolve([
              "status": "declined",
              "eligibleForAgeFeatures": eligible,
              "regulatoryFeatures": regulatoryFeatures
            ])
          case .sharing(let range):
            var payload: [String: Any] = [
              "status": "shared",
              "declaration": range.ageRangeDeclaration.map { String(describing: $0) } ?? "unknown",
              "activeParentalControls": range.activeParentalControls.description,
              "eligibleForAgeFeatures": eligible,
              "regulatoryFeatures": regulatoryFeatures
            ]
            if let lowerBound = range.lowerBound {
              payload["lowerBound"] = lowerBound
            }
            if let upperBound = range.upperBound {
              payload["upperBound"] = upperBound
            }
            promise.resolve(payload)
          @unknown default:
            promise.resolve(["status": "unavailable"])
          }
        } catch {
          promise.resolve(["status": "unavailable"])
        }
      }
    }.runOnQueue(.main)
  }
}

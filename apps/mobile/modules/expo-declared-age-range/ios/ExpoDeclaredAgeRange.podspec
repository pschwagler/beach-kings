Pod::Spec.new do |s|
  s.name = 'ExpoDeclaredAgeRange'
  s.version = '1.0.0'
  s.summary = 'Privacy-preserving bridge to Apple Declared Age Range.'
  s.description = 'Requests an Apple-declared age range without exposing an exact birthdate.'
  s.author = 'Beach League'
  s.homepage = 'https://beachleaguevb.com'
  # The app continues to support older iOS releases. The module weak-links the
  # iOS 26 framework and guards every call with runtime availability checks.
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end

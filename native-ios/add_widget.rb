# Adds the Live Activity widget extension + the app's native plugin files to the Capacitor iOS project.
require 'xcodeproj'

version = ENV.fetch('APP_VERSION', '1.0')
build = ENV.fetch('APP_BUILD', '1')
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' } or abort 'App target not found'

app_group = project.main_group.children.find { |g| g.display_name == 'App' } or abort 'App group not found'
app_files = %w[ZeszytAttributes.swift LiveActivityPlugin.swift ZeszytViewController.swift].map do |f|
  app_group.new_reference(f)
end
app.add_file_references(app_files)

widget = project.new_target(:app_extension, 'ZeszytWidget', :ios, '16.2', nil, :swift)
wgroup = project.main_group.new_group('ZeszytWidget', 'ZeszytWidget')
wsrc = wgroup.new_reference('ZeszytWidget.swift')
wgroup.new_reference('Info.plist')
widget.add_file_references([wsrc, app_files[0]])
%w[WidgetKit SwiftUI ActivityKit].each { |fw| widget.add_system_framework(fw) }

widget.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'pl.zeszyt.app.widget'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'ZeszytWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['MARKETING_VERSION'] = version
  s['CURRENT_PROJECT_VERSION'] = build
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['CODE_SIGN_STYLE'] = 'Automatic'
end

app.build_configurations.each do |c|
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.2'
  c.build_settings['MARKETING_VERSION'] = version
  c.build_settings['CURRENT_PROJECT_VERSION'] = build
end

app.add_dependency(widget)
embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(widget.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "Widget target added (#{version} / #{build})"

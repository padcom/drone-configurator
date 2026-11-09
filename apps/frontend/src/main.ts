import './style.css'
import { bridgeTransport } from '@pico-desktop/communicator'
import { i18n } from './i18n'
import { mountIsland } from './mountIsland'
import { mockBackend } from './mock-backend'
import { createConfigurator } from './useConfigurator'
import ConfirmDialog from './ConfirmDialog.vue'
import ConnectionBar from './ConnectionBar.vue'
import MetadataStatus from './MetadataStatus.vue'
import ParamEditor from './ParamEditor.vue'
import ParamFilter from './ParamFilter.vue'
import ParamTable from './ParamTable.vue'
import SnapshotImport from './SnapshotImport.vue'
import SnapshotToolbar from './SnapshotToolbar.vue'
import TelemetryCards from './TelemetryCards.vue'

document.title = i18n.global.t('app.title')

// In Pico Desktop the native bridge; in a plain browser (`pnpm ui`) the mock backend.
const bridge = window.picoDesktop
createConfigurator(bridge ? bridgeTransport(bridge) : mockBackend())

// Every region of the page is a component, mounted into its element of index.html.
mountIsland(ConnectionBar, '#connection-bar')
mountIsland(ParamFilter, '#param-filter')
mountIsland(SnapshotToolbar, '#snapshot-toolbar')
mountIsland(MetadataStatus, '#metadata-status-root')
mountIsland(SnapshotImport, '#snapshot-import')
mountIsland(ParamTable, '#param-table')
mountIsland(ParamEditor, '#param-editor')
mountIsland(TelemetryCards, '#telemetry')
mountIsland(ConfirmDialog, '#confirm-root')

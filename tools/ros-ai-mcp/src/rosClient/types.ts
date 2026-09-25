// src/rosClient/types.ts

// Generic envelope every masros-gui @ResponseBody controller wraps its payload in.
export interface RequestPaginationData<T> {
  requestData: T;
  resultSize?: number;
  pageSize?: number;
  pageNumber?: number;
  from?: number;
  to?: number;
  successMessage?: string;
  errorMessage?: string;
  responseStatus?: number;
  redirect?: string;
}

export interface RosFlow {
  flowId: number;
  flowCode: string;
  flowDes: string;
  priority: number;
  activeFlag: string;
  massFlag: string;
  rosFlag: string;
  inMemoryFlag: string;
  dbReprocessFlag: string;
  syncBy: string;
  version: number;
  modDate: string;
  userName: string;
  eagerFlag: string;
}

export interface RosFlowNotification {
  notificationId: number;
  flowId: number;
  email: string;
  version: number;
  modDate: string;
  userName: string;
}

export interface RosFlowRouting {
  routingId: number;
  flowId: number;
  httpMethod: string;
  urlExp: string;
  version: number;
  modDate: string;
  userName: string;
  domain: string;
  authorizationType: string;
  httpResponseSuccess: string;
  httpResponseError: string;
  soapHeaderReqProperty: string | null;
  soapHeaderResProperty: string | null;
  soapBodyReqProperty: string | null;
  soapBodyResProperty: string | null;
  soapHeaderReqNamespace: string | null;
  soapHeaderResNamespace: string | null;
  soapBodyReqNamespace: string | null;
  soapBodyResNamespace: string | null;
}

export interface FlowGroup {
  flowGroupId: number;
  name: string;
  flowGroupCode: string;
  flowGroupDes: string;
}

export interface RosSchemaData {
  rosSchemaDataId: number;
  schemaId: number;
  seqno: number;
  property: string;
  propertyType: string;
  refSchemaId: number | null;
  description: string | null;
  required: string | null;
  version: number;
  modDate: string;
  userName: string;
  examplePropertyValue: string | null;
  format: string | null;
}

export interface RosFlowActionError {
  flowId: number;
  actionId: number;
  version: number;
  modDate: string;
  userName: string;
}

export interface RosAction {
  actionId: number;
  actionCode: string;
  actionDes: string;
  syncBy: string;
  workerClass: string;
  command: string;
  actionType: string;
  commandType: string;
  domain: string;
  protocol: string;
  method: string;
  contentType: string;
  version: number;
  modDate: string;
  userName: string;
  eager: string;
  hash: string;
  actionYmlConfig: Record<string, unknown>;
}

export interface RosActionHist extends RosAction {
  histId: number;
}

// Wire body of POST /actionDetail/saveAction — a Map<String,Object> server-side,
// NOT the same field names as the read-side RosAction (actionCommands not
// command, actionSync not syncBy, version is a string).
export interface SaveActionRequestBody {
  actionData: {
    actionId: number; // -1 (RosAction.NEW_ACTION sentinel) to create
    actionCode: string;
    actionDes: string;
    actionSync?: string;
    actionType: string;
    commandType: string;
    actionCommands: string;
    // Optional, NOT string — ROS's ActionOperation.createTmpScriptAndCompile
    // checks `actionInfo.getDomain() != null` to decide whether this action
    // has a package. An empty string "" is not null, so sending domain:"" for
    // a domain-less GROOVY/PYTHON action makes ROS treat it as having an
    // empty package, producing a malformed compile path (a stray path
    // separator) that breaks server-side compilation on save — confirmed
    // live 2026-09-07. Omit the key entirely (undefined) when there's no
    // domain; never default it to "".
    domain?: string;
    // Also optional, same reasoning as domain above (generalized 2026-09-08):
    // ROS's Java code frequently checks "!= null" rather than isBlank(), so an
    // empty string is not a safe stand-in for "not set" anywhere in this body.
    // method specifically was confirmed live to matter for GROOVY/PYTHON
    // actions — ROS requires method:"run" to match the script's own run()
    // entry point, and omitting it must not silently become "". protocol/
    // contentType/workerClass/actionSync are fixed pre-emptively on the same
    // reasoning; none of the four has an individually-confirmed live failure
    // the way domain and method do.
    protocol?: string;
    method?: string;
    contentType?: string;
    workerClass?: string;
    version: string;
    eager: string;
  };
  READ_TIMEOUT?: number;
  CONNECT_TIMEOUT?: number;
  REST_HEADERS?: Record<string, string>;
  CIRCUIT_BREAKER_CONFIG?: unknown;
  TOPIC_KEY?: string;
  SYSTEM?: string;
  DESCRIPTION?: string;
  // Config keys are a passthrough overlay of ActionDBConfig.config's
  // open-ended value type (e.g. KPI, or anything added later) — not just the
  // ones this tool names above.
  [key: string]: unknown;
}

export interface Business {
  owner: string;
  manager: string;
  name: string;
  etomProcessId: string;
  etomProcessName: string;
  purpose: string;
}

export interface RosFlowOnErrorDto {
  actionId: number | null;
  force: boolean | null;
}

export interface FlowInfo {
  flow: RosFlow;
  flowNotification: RosFlowNotification | null;
  allAvailableRoutes: RosFlowRouting[];
  availableFlowGroup: FlowGroup[];
  selectFlowGroup: FlowGroup[];
  allFlowSchemaDatasPath: Record<string, RosSchemaData>;
  flowActionError: RosFlowActionError | null;
  actionErrorDetail: RosAction | null;
  businessInfo: Business | null;
  isInMemory: boolean;
  jobProcessedAction: number | null;
  jobFinishedAction: number | null;
  onCancelAction: RosFlowOnErrorDto;
  onCancelAllAction: RosFlowOnErrorDto;
  description: string | null;
}

export interface StepOptimistic {
  flowId: number;
  stepId: number;
  parentStepId: number;
  actionId: number;
  flowActionDes: string;
  action: RosAction;
  preActionId: number | null;
  preAction: RosAction | null;
  flow: RosFlow | null;
  multiplyArrProp: string | null;
  decisionCriteria: string | null;
  decision: string | null;
  version: number;
  modDate: string;
  userName: string;
  bypass: string;
  switchPropertyPath: string | null;
  sizeRos: string;
  sizeMass: string;
  syncStep: string;
  modDateYmls: number | null;
  ymlConfig: unknown;
  alerts: unknown;
}

// requestData shape of POST /getUserFlows — used by search_flows.
export interface UserFlowSummary {
  flowId: number;
  flowCode: string;
  flowDes: string;
  priority: number;
  activeFlag: string;
  massFlag: string;
  rosFlag: string;
  syncBy: string;
  inMemoryFlag: string;
  dbReprocessFlag: string;
  permisionLevelCode: string;
  routings?: string;
}

// GET /actionDBConfig/{actionId} — the shape of ROS's `requestData` payload.
// The endpoint itself wraps this in the same RequestPaginationData envelope
// as /actionInformation (confirmed 2026-09-03 against real DEV ROS — the raw
// response is `{ ..., requestData: { config: {...} } }`, not this object
// directly); see getAction.ts's unwrap.
export interface ActionDBConfig {
  version: number;
  modDate: string;
  userName: string;
  config: Record<
    string,
    {
      SYSTEM?: string;
      READ_TIMEOUT?: number;
      CONNECT_TIMEOUT?: number;
      DESCRIPTION?: string;
      REST_HEADERS?: Record<string, string>;
      KPI?: unknown;
      CIRCUIT_BREAKER_CONFIG?: unknown;
      TOPIC_KEY?: string;
    }
  >;
}

// GET /actionTemplate/{commandType} — has no envelope either.
export interface ActionTemplateResponse {
  availableCodes: Array<{
    key: string;
    label: string;
    value: string;
    methodToInvoke: string;
  }>;
}

export interface ItemAlert {
  hasNotErrorParser: boolean;
  retries: number;
  process: string;
  notify: number;
  countAlerts: number;
}

export interface StepData {
  stepId: number;
  statusCode: string;
  statusDes: string;
  statusDate: string;
  transactionDate: string | null;
  startDateWorker: string | null;
  endDate: string | null;
  previousStepId: number | null;
  actionElapsedMillis: number | null;
  alerts: ItemAlert | null;
  workerInstance: string | null;
  actionVersion: number | null;
}

export interface SearchRosItemParam {
  seqId: number;
  stepId: number | null;
  actionId: number | null;
  actionCode: string | null;
  actionDes: string | null;
  rosSchemaDataId: number | null;
  schemaId: number | null;
  propertyPath: string | null;
  propertyValueType: number | null;
  propertyValueDate: string | null;
  propertyValueString: string | null;
  propertyValueClob: string | null;
  propertyValueNumber: number | null;
  propertyValueBoolean: boolean | null;
  propertyValueId: number | null;
  entryDate: string | null;
}

export interface MemberItem {
  itemId: number;
  flowCode: string;
  flowDes: string;
  statusCode: string;
  statusDes: string;
  histSteps?: { step: StepData[] } | null;
}

export interface SplitMemberItem {
  forStepId: number;
  itemId: string;
  flowCode: string;
  flowDes: string;
  statusCode: string;
  statusDes: string;
  histSteps?: { step: StepData[] } | null;
}

export interface SubprocessMemberItem {
  forStepId: number;
  itemId: string;
  flowCode: string;
  flowDes: string;
  statusCode: string;
  statusDes: string;
  rfsVersion: number;
}

export interface RelatedItem {
  itemId: string;
  flowCode: string;
  statusCode: string;
  statusDes: string;
  schedulerId: number | null;
  refItemStepId: number | null;
}

export interface SearchRosItem {
  itemId: string;
  rootItemId: number | null;
  executionDate: string;
  futureExecution: boolean;
  statusDate: string;
  actionId: number | null;
  actionCode: string;
  actionDes: string;
  actionCustomDes: string | null;
  flowId: number;
  flowCode: string;
  flowDes: string;
  statusId: number;
  statusCode: string;
  statusDes: string;
  statusSublevelsCode: string | null;
  origin: string | null;
  stepId: number;
  historyDetails: boolean | null;
  orderno: string | null;
  externalId: string | null;
  externalType: string | null;
  customerId: string | null;
  coId: string | null;
  actionType: string;
  recVersion: number;
  retriesLeft: number | null;
  retries: number | null;
  reasonId: number | null;
  reasonCode: string | null;
  reasonDesc: string | null;
  stepComment: string | null;
  schedulerId: number | null;
  priority: number | null;
  userName: string | null;
  newCustomerId: string | null;
  newCoId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errConfId: number | null;
  errActionId: number | null;
  errActionStatusId: number | null;
  rfsVersion: number | null;
  listRosItemParam: { itemParam: SearchRosItemParam[] } | null;
  splitItemId: number | null;
  histSteps: { step: StepData[] } | null;
  messageId: string | null;
  processTransaction: number | null;
  transactionDate: string | null;
  errActionCode: string | null;
  errActionDes: string | null;
  circuitBreakerStatus: string | null;
  itemType: string | null;
  expiryDate: string | null;
  transferredFrom: string | null;
  transferredTo: string | null;
  groupMembers?: { member: MemberItem[] } | null;
  cloneMembers?: { member: MemberItem[] } | null;
  parentMembers?: { member: MemberItem[] } | null;
  subprocessMembers?: { member: SubprocessMemberItem[] } | null;
  splitMembers?: { member: SplitMemberItem[] } | null;
  staticParams?: unknown;
  deepStatusLevelList?: unknown;
  deepStatusLevelIndependentList?: unknown;
  flowItem?: RelatedItem | null;
}

// requestData entry shape of POST /getStepDataExtraDetails with searchInMemory:true
// (the Elasticsearch branch — the only branch this MCP server uses; see the DB
// branch's different field set and opposite sort order in the implementation plan
// if that branch is ever added later).
export interface StepDataExtraDetailEntry {
  STEP_ID: number;
  ACTION_DES: string;
  STATUS_ID: number;
  STATUS_DATE: string;
  TRANSACTION_DATE: string | null;
  REC_VERSION: number;
  RETRIES: number | null;
  WORKER_INSTANCE: string | null;
  ERROR_MESSAGE: string | null;
  PREV_ACTION_ID: number | null;
  PREV_STEP_ID: number | null;
  PREV_ACTION_ELAPSED_MILLIS: number | null;
  PROCESS_TRANSACTION: number | null;
  EXPIRY_DATE: string | null;
}

// Wire body of POST /saveFlowDetail when flowId is the -1 sentinel (create).
// FlowDetailForm (server-side) has more fields (business info, description,
// etc.) — this is only the subset create_flow (Phase 8) exposes. syncBy and
// priority are NOT here: ROS hardcodes them server-side (syncBy="NONE",
// priority=10) and ignores any client-supplied value.
export interface SaveFlowDetailRequestBody {
  flowId: number; // always -1 for create_flow — updating an existing flow header is out of scope
  flowCode: string;
  flowDes: string;
  activeFlag: boolean;
  massFlag: boolean;
  rosFlag: boolean;
  eagerFlag: boolean;
  inMemory: boolean;
  dbReprocessFlag: boolean;
  flowGroups: number[];
  onCancelAction?: { actionId: number; force?: boolean };
  onCancelAllAction?: { actionId: number; force?: boolean };
  emailNotification?: string;
}

// A single step in the flat, DFS-numbered array POST /saveFlowStep expects.
// _bypass/_syncStep are the real wire field names on write — underscore-prefixed,
// unlike the read-side `bypass`/`syncStep` (StepOptimistic), AND booleans on write
// vs. "Y"/null strings on read. Confirmed by reading FlowProcessor.saveFlowSteps in
// ROS's own Java source (C:\Users\52554\Documents\masros): it does
// `Boolean bypass = (Boolean) step.get("_bypass")` then `rfs.setBypass(bypass ? "Y" : null)`
// — sending a string here throws ClassCastException (reproduced live against ROS DEV,
// 2026-09-22, on flow 64506 itself; write rolled back cleanly, no data lost).
export interface WireFlowStep {
  stepId: number;
  parentStepId: number;
  actionCode: string;
  flowActionDes?: string;
  decision?: 'Y' | 'N';
  ymlConfig?: Record<string, Record<string, unknown>>;
  multiplyArrProp?: string;
  _bypass?: boolean;
  _syncStep?: boolean;
}

// Wire body of POST /saveFlowStep. version:0/modDate:0 are the sentinels
// save_flow_steps always sends — the only case v1 supports is a flow with
// zero prior step-save history (see Global Constraints).
export interface SaveFlowStepBody {
  flowId: number;
  version: number;
  modDate: number;
  flowSteps: WireFlowStep[];
}

export interface MonitorProcessJobItem {
  stepId: number;
  actionId: number;
  actionCode: string;
  actionDes: string;
  statusId: number;
  statusCode: string;
  statusDes: string;
  items: number;
}

export interface HistoryJobItem {
  histId: number;
  statusDate: string;
  modUser: string;
  statusId: number;
  statusCode: string;
  statusDes: string;
  startDate: string;
}

export interface ErrorCodeGroupItem {
  errorCode: string;
  items: number;
  actionId: number;
  actionDes: string;
  areSubflows: boolean;
  isEvaluatorAction: boolean;
  errorType: string;
}

// GET /jobDetail?jobId=X on ros-rest (RosInterfaceRestController.searchJobDetail).
// Always carries responseStatus (extends BaseResponse). When jobId doesn't exist
// in MassScheduler nor MassSchedulerHist, ROS does NOT error — it silently
// returns a response with only responseStatus populated; every other field is
// absent. errorCodeGroup/monitorProcessJobHist are only populated for
// non-historical (in-progress) jobs — see SearchJobDetailOperation.java.
export interface JobDetailResponse {
  responseStatus: { status: number; statusCode: string; statusMessage: string };
  jobId?: number | null;
  flowId?: number | null;
  flowCode?: string | null;
  flowDes?: string | null;
  filename?: string | null;
  createUser?: string | null;
  statusId?: number | null;
  statusCode?: string | null;
  statusDes?: string | null;
  entryDate?: string | null;
  startDate?: string | null;
  items?: number | null;
  progressPercentage?: number | null;
  historyDetails?: boolean | null;
  schedulerNotification?: { notificationId?: number; email?: string[] } | null;
  monitorProcessJob?: { item: MonitorProcessJobItem[] } | null;
  monitorProcessJobHist?: { item: MonitorProcessJobItem[] } | null;
  historyJob?: { item: HistoryJobItem[] } | null;
  errorCodeGroup?: { errorItem: ErrorCodeGroupItem[] } | null;
}

// POST /rosActionParserExecute (search) — a row of RosActionParser, the table
// behind an action's "Parsers" tab in masros-gui. This is the ONLY place a
// PROCEDURE-type action's real stored-procedure parameter signature lives —
// /actionDBConfig (see ActionDBConfig above) never has it, confirmed by
// reading ActionDBConfigController.java directly (it only ever returns the
// generic protocol/YML config map, never parameter bindings).
//
// parserTarget "INPUT_PARAM": propertyPath is the item property supplying the
// IN parameter's value, schemaDefId is its type (see SCHEMA_DEF_ID_NAMES).
// parserTarget "OUTPUT_PARAM_TYPE": parserValue is the raw PL/SQL out type
// (VARCHAR/NUMBER/CURSOR/DATE), declaring the shape of one OUT parameter
// position — it does not by itself say where that value goes.
// parserTarget "STORE_PARAM": propertyPath is the item property an OUTPUT
// value gets written into. An OUTPUT_PARAM_TYPE row and a STORE_PARAM row
// sharing the same seqId are the two halves of one output parameter — join
// them on seqId to get "this OUT param's type" + "where it's stored".
export interface RosActionParser {
  parserId: number;
  actionId: number;
  parserTarget: string;
  seqId: number | null;
  parserType: string | null;
  parserValue: string | null;
  propertyPath: string | null;
  schemaDefId: number | null;
  propertyType: string | null;
  version: number;
  modDate: number;
  userName: string;
  toEncryptedStored?: boolean;
}

// schemaDefId -> human name, mirrors masros-gui's SCHEMA_OBJECT map in
// resources/js/actions/action_parser.js (confirmed 2026-09-21).
export const SCHEMA_DEF_ID_NAMES: Record<number, string> = {
  1: 'String',
  2: 'Number',
  3: 'Boolean',
  4: 'Date',
  5: 'Clob',
  16: 'Encrypted',
};

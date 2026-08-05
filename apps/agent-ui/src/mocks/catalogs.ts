/** Static reference data used to generate a realistic, varied mock inventory. */
import type { OsInfoSupportTierEnum } from "@openshift-migration-advisor/agent-sdk";

export const DATACENTER_COUNT = 48;
export const CLUSTER_COUNT = 2200;
export const VM_COUNT = 1200;

const CITY_NAMES = [
  "Austin",
  "Boston",
  "Chicago",
  "Denver",
  "Frankfurt",
  "Dublin",
  "London",
  "Paris",
  "Madrid",
  "Milan",
  "Amsterdam",
  "Warsaw",
  "Tokyo",
  "Osaka",
  "Seoul",
  "Singapore",
  "Sydney",
  "Melbourne",
  "Toronto",
  "Montreal",
  "SaoPaulo",
  "MexicoCity",
  "Mumbai",
  "Bangalore",
  "CapeTown",
  "Nairobi",
  "Dubai",
  "TelAviv",
  "Seattle",
  "Portland",
  "Phoenix",
  "Atlanta",
  "Miami",
  "Raleigh",
  "Minneapolis",
  "KansasCity",
  "SaltLakeCity",
  "Vancouver",
  "Calgary",
  "Helsinki",
  "Stockholm",
  "Oslo",
  "Zurich",
  "Vienna",
  "Prague",
  "Lisbon",
  "Brussels",
  "Auckland",
];

export function buildDatacenterNames(): string[] {
  return Array.from(
    { length: DATACENTER_COUNT },
    (_, i) =>
      `DC-${CITY_NAMES[i % CITY_NAMES.length]}-${String(i + 1).padStart(2, "0")}`,
  );
}

export const HOST_VENDOR_MODELS: Array<{ vendor: string; model: string }> = [
  { vendor: "Dell", model: "PowerEdge R740" },
  { vendor: "Dell", model: "PowerEdge R750" },
  { vendor: "Dell", model: "PowerEdge R650" },
  { vendor: "HPE", model: "ProLiant DL380 Gen10" },
  { vendor: "HPE", model: "ProLiant DL360 Gen10" },
  { vendor: "HPE", model: "Synergy 480 Gen10" },
  { vendor: "Cisco", model: "UCS C220 M5" },
  { vendor: "Cisco", model: "UCS C240 M6" },
  { vendor: "Lenovo", model: "ThinkSystem SR650" },
  { vendor: "Lenovo", model: "ThinkSystem SR630" },
  { vendor: "Supermicro", model: "SYS-620U-TNR" },
  { vendor: "Huawei", model: "FusionServer 2288H V5" },
];

export const NETWORK_CATALOG: Array<{
  name: string;
  type: "standard" | "distributed" | "dvswitch" | "unsupported";
  vlanId?: string;
}> = [
  { name: "VLAN10-Production", type: "distributed", vlanId: "10" },
  { name: "VLAN20-Database", type: "distributed", vlanId: "20" },
  { name: "VLAN30-DMZ", type: "dvswitch", vlanId: "30" },
  { name: "VLAN40-Development", type: "standard", vlanId: "40" },
  { name: "VLAN50-QA", type: "standard", vlanId: "50" },
  { name: "VLAN60-Management", type: "distributed", vlanId: "60" },
  { name: "VLAN70-Storage", type: "distributed", vlanId: "70" },
  { name: "VLAN80-Backup", type: "standard", vlanId: "80" },
  { name: "VLAN90-Guest", type: "unsupported", vlanId: "90" },
  { name: "VLAN100-vMotion", type: "distributed", vlanId: "100" },
  { name: "VLAN110-DR", type: "dvswitch", vlanId: "110" },
  { name: "VLAN120-VDI", type: "standard", vlanId: "120" },
];

export const DATASTORE_CATALOG: Array<{
  type: string;
  vendor: string;
  model: string;
  protocolType: string;
}> = [
  {
    type: "VMFS",
    vendor: "Dell EMC",
    model: "PowerStore 5200T",
    protocolType: "FC",
  },
  { type: "VMFS", vendor: "NetApp", model: "AFF A400", protocolType: "iSCSI" },
  { type: "NFS", vendor: "NetApp", model: "FAS8300", protocolType: "NFS" },
  {
    type: "vSAN",
    vendor: "VMware",
    model: "vSAN ReadyNode",
    protocolType: "vSAN",
  },
  {
    type: "VMFS",
    vendor: "Pure Storage",
    model: "FlashArray//X70",
    protocolType: "FC",
  },
  { type: "VMFS", vendor: "HPE", model: "Nimble AF40", protocolType: "iSCSI" },
  {
    type: "NFS",
    vendor: "Dell EMC",
    model: "Isilon H500",
    protocolType: "NFS",
  },
];

interface OsCatalogEntry {
  guestName: string;
  guestId: string;
  supported: boolean;
  supportTier: OsInfoSupportTierEnum;
  upgradeRecommendation?: string;
  family: "linux" | "windows" | "other";
}

export const OS_CATALOG: OsCatalogEntry[] = [
  {
    guestName: "Red Hat Enterprise Linux 9 (64-bit)",
    guestId: "rhel9_64Guest",
    supported: true,
    supportTier: "certified",
    family: "linux",
  },
  {
    guestName: "Red Hat Enterprise Linux 8 (64-bit)",
    guestId: "rhel8_64Guest",
    supported: true,
    supportTier: "certified",
    family: "linux",
  },
  {
    guestName: "CentOS Stream 9 (64-bit)",
    guestId: "centos9_64Guest",
    supported: true,
    supportTier: "vendor_supported",
    family: "linux",
  },
  {
    guestName: "Ubuntu Linux (64-bit)",
    guestId: "ubuntu64Guest",
    supported: true,
    supportTier: "vendor_supported",
    family: "linux",
  },
  {
    guestName: "SUSE Linux Enterprise 15 (64-bit)",
    guestId: "sles15_64Guest",
    supported: true,
    supportTier: "vendor_supported",
    family: "linux",
  },
  {
    guestName: "Debian GNU/Linux 12 (64-bit)",
    guestId: "debian12_64Guest",
    supported: true,
    supportTier: "community_supported",
    family: "linux",
  },
  {
    guestName: "Oracle Linux 9 (64-bit)",
    guestId: "oracleLinux9_64Guest",
    supported: true,
    supportTier: "vendor_supported",
    family: "linux",
  },
  {
    guestName: "Microsoft Windows Server 2022 (64-bit)",
    guestId: "windows2022srvNext_64Guest",
    supported: true,
    supportTier: "certified",
    family: "windows",
  },
  {
    guestName: "Microsoft Windows Server 2019 (64-bit)",
    guestId: "windows2019srv_64Guest",
    supported: true,
    supportTier: "certified",
    family: "windows",
  },
  {
    guestName: "Microsoft Windows Server 2016 (64-bit)",
    guestId: "windows9Server64Guest",
    supported: true,
    supportTier: "vendor_supported",
    family: "windows",
  },
  {
    guestName: "Microsoft Windows 10 (64-bit)",
    guestId: "windows9_64Guest",
    supported: true,
    supportTier: "community_supported",
    family: "windows",
  },
  {
    guestName: "Microsoft Windows 11 (64-bit)",
    guestId: "windows11_64Guest",
    supported: true,
    supportTier: "community_supported",
    family: "windows",
  },
  {
    guestName: "Microsoft Windows Server 2012 R2 (64-bit)",
    guestId: "windows8Server64Guest",
    supported: false,
    supportTier: "special_handling",
    upgradeRecommendation: "Microsoft Windows Server 2022 (64-bit)",
    family: "windows",
  },
  {
    guestName: "Microsoft Windows Server 2008 R2 (64-bit)",
    guestId: "windows7Server64Guest",
    supported: false,
    supportTier: "special_handling",
    upgradeRecommendation: "Microsoft Windows Server 2022 (64-bit)",
    family: "windows",
  },
  {
    guestName: "CentOS 7 (64-bit)",
    guestId: "centos7_64Guest",
    supported: false,
    supportTier: "special_handling",
    upgradeRecommendation: "Red Hat Enterprise Linux 9 (64-bit)",
    family: "linux",
  },
  {
    guestName: "FreeBSD 13 (64-bit)",
    guestId: "freebsd13_64Guest",
    supported: false,
    supportTier: "special_handling",
    family: "other",
  },
  {
    guestName: "Other Linux (64-bit)",
    guestId: "otherLinux64Guest",
    supported: false,
    supportTier: "special_handling",
    family: "other",
  },
];

export const OS_CATALOG_WEIGHTS: number[] = [
  22, 18, 8, 10, 6, 3, 5, 12, 8, 4, 5, 2, 3, 2, 3, 1, 1,
];

interface AppCatalogEntry {
  name: string;
  description: string;
  processes: Array<{ name: string; version: string }>;
}

export const APPLICATION_CATALOG: AppCatalogEntry[] = [
  {
    name: "nginx",
    description: "High-performance HTTP server and reverse proxy",
    processes: [{ name: "nginx", version: "1.25.3" }],
  },
  {
    name: "PostgreSQL",
    description: "Open source relational database",
    processes: [{ name: "postgres", version: "15.4" }],
  },
  {
    name: "MySQL",
    description: "Open source relational database",
    processes: [{ name: "mysqld", version: "8.0.35" }],
  },
  {
    name: "Apache Tomcat",
    description: "Java servlet container and web server",
    processes: [
      { name: "java", version: "17.0.9" },
      { name: "catalina", version: "10.1.16" },
    ],
  },
  {
    name: "Redis",
    description: "In-memory data structure store",
    processes: [{ name: "redis-server", version: "7.2.3" }],
  },
  {
    name: "MongoDB",
    description: "Document-oriented NoSQL database",
    processes: [{ name: "mongod", version: "7.0.4" }],
  },
  {
    name: "RabbitMQ",
    description: "Message broker",
    processes: [{ name: "beam.smp", version: "3.12.10" }],
  },
  {
    name: "Apache Kafka",
    description: "Distributed event streaming platform",
    processes: [
      { name: "java", version: "17.0.9" },
      { name: "kafka.Kafka", version: "3.6.0" },
    ],
  },
  {
    name: "Elasticsearch",
    description: "Distributed search and analytics engine",
    processes: [
      { name: "java", version: "17.0.9" },
      { name: "elasticsearch", version: "8.11.1" },
    ],
  },
  {
    name: "Docker Engine",
    description: "Container runtime",
    processes: [{ name: "dockerd", version: "24.0.7" }],
  },
  {
    name: "JBoss EAP",
    description: "Java EE application server",
    processes: [
      { name: "java", version: "11.0.21" },
      { name: "standalone.sh", version: "7.4" },
    ],
  },
  {
    name: "Oracle Database",
    description: "Enterprise relational database",
    processes: [{ name: "oracle", version: "19.20" }],
  },
  {
    name: "SAP HANA",
    description: "In-memory database platform",
    processes: [{ name: "hdbindexserver", version: "2.00.070" }],
  },
  {
    name: "Microsoft SQL Server",
    description: "Relational database management system",
    processes: [{ name: "sqlservr", version: "16.0.4085" }],
  },
  {
    name: "Microsoft IIS",
    description: "Windows web server",
    processes: [{ name: "w3wp", version: "10.0" }],
  },
  {
    name: "Microsoft Exchange",
    description: "Email and calendaring server",
    processes: [
      { name: "Microsoft.Exchange.Directory.TopologyService", version: "15.2" },
    ],
  },
  {
    name: "Active Directory",
    description: "Directory and identity service",
    processes: [{ name: "lsass", version: "10.0" }],
  },
  {
    name: "Jenkins",
    description: "Automation and CI/CD server",
    processes: [
      { name: "java", version: "17.0.9" },
      { name: "jenkins", version: "2.426.1" },
    ],
  },
  {
    name: "HAProxy",
    description: "Load balancer and proxy server",
    processes: [{ name: "haproxy", version: "2.8.4" }],
  },
  {
    name: "Grafana",
    description: "Observability and monitoring dashboard",
    processes: [{ name: "grafana-server", version: "10.2.2" }],
  },
];

export const NIC_COUNT_WEIGHTS: Array<{ count: number; weight: number }> = [
  { count: 1, weight: 55 },
  { count: 2, weight: 30 },
  { count: 3, weight: 10 },
  { count: 4, weight: 5 },
];

export const CPU_COUNT_WEIGHTS: Array<{ count: number; weight: number }> = [
  { count: 1, weight: 18 },
  { count: 2, weight: 32 },
  { count: 4, weight: 26 },
  { count: 8, weight: 14 },
  { count: 16, weight: 6 },
  { count: 32, weight: 3 },
  { count: 64, weight: 1 },
];

export const MEMORY_MB_WEIGHTS: Array<{ mb: number; weight: number }> = [
  { mb: 2048, weight: 8 },
  { mb: 4096, weight: 22 },
  { mb: 8192, weight: 28 },
  { mb: 16384, weight: 20 },
  { mb: 32768, weight: 12 },
  { mb: 65536, weight: 7 },
  { mb: 131072, weight: 2 },
  { mb: 262144, weight: 1 },
];

export const LABEL_CATALOG: string[] = [
  "env:production",
  "env:staging",
  "env:development",
  "env:qa",
  "team:platform",
  "team:data",
  "team:web",
  "team:security",
  "backup:daily",
  "backup:weekly",
  "tier:frontend",
  "tier:backend",
  "tier:database",
  "criticality:high",
  "criticality:low",
  "owner:it-ops",
  "cost-center:eng",
  "compliance:pci",
];

export const DISK_BUS_TYPES = ["scsi", "sata", "nvme"] as const;

export type IssueCategory =
  | "Critical"
  | "Warning"
  | "Information"
  | "Advisory"
  | "Error"
  | "Other";

export interface IssueCatalogEntry {
  label: string;
  category: IssueCategory;
  description: string;
  assessment: string;
  weight: number;
}

export const ISSUE_CATALOG: IssueCatalogEntry[] = [
  {
    label: "Unsupported guest OS",
    category: "Critical",
    description:
      "The guest operating system is not supported by the target migration platform.",
    assessment:
      "VMs with an unsupported guest OS cannot be migrated until the OS is upgraded.",
    weight: 10,
  },
  {
    label: "Fault tolerance enabled",
    category: "Critical",
    description:
      "vSphere Fault Tolerance is enabled on this VM, which is not supported by the target platform.",
    assessment: "Disable Fault Tolerance before migrating this VM.",
    weight: 3,
  },
  {
    label: "Shared disk (RDM)",
    category: "Critical",
    description:
      "This VM has one or more Raw Device Mapped disks shared with other VMs (commonly used for clustering).",
    assessment:
      "Shared disks require special handling and are not migrated automatically.",
    weight: 4,
  },
  {
    label: "CD/DVD drive attached",
    category: "Warning",
    description:
      "A CD/DVD drive is attached to this VM and may reference physical or ISO media.",
    assessment: "Detach the CD/DVD drive to avoid migration interruptions.",
    weight: 12,
  },
  {
    label: "Nested virtualization enabled",
    category: "Warning",
    description: "Hardware-assisted virtualization is exposed to the guest OS.",
    assessment:
      "Nested virtualization may not be supported on the target hypervisor.",
    weight: 3,
  },
  {
    label: "USB device attached",
    category: "Warning",
    description:
      "A USB controller or passthrough device is configured on this VM.",
    assessment:
      "USB passthrough devices are not migrated; remove or replace before migrating.",
    weight: 6,
  },
  {
    label: "Serial or parallel port configured",
    category: "Warning",
    description: "This VM has a serial or parallel port device configured.",
    assessment: "Remove unused serial/parallel port devices before migration.",
    weight: 5,
  },
  {
    label: "Large disk capacity (>2TB)",
    category: "Warning",
    description:
      "This VM has one or more disks larger than 2TB, which increases migration time.",
    assessment:
      "Plan additional migration time and bandwidth for large-disk VMs.",
    weight: 8,
  },
  {
    label: "High vCPU count (>32)",
    category: "Advisory",
    description:
      "This VM is provisioned with a high vCPU count relative to the fleet average.",
    assessment:
      "Validate target cluster capacity before migrating high-vCPU VMs.",
    weight: 4,
  },
  {
    label: "Missing VMware Tools",
    category: "Warning",
    description: "VMware Tools is not installed or not running on this VM.",
    assessment:
      "Install and start VMware Tools (or open-vm-tools) for accurate guest metrics.",
    weight: 9,
  },
  {
    label: "Static MAC address configured",
    category: "Information",
    description: "This VM uses a manually assigned static MAC address.",
    assessment:
      "Verify the static MAC address is preserved after migration if required.",
    weight: 5,
  },
  {
    label: "Powered-off VM",
    category: "Information",
    description: "This VM is currently powered off.",
    assessment:
      "Powered-off VMs migrate faster but should be validated before cutover.",
    weight: 10,
  },
  {
    label: "Template VM",
    category: "Advisory",
    description: "This object is a VM template rather than a running VM.",
    assessment:
      "Confirm whether templates should be included in the migration wave.",
    weight: 3,
  },
  {
    label: "Snapshot present",
    category: "Advisory",
    description: "This VM has one or more active snapshots.",
    assessment:
      "Consolidate or remove snapshots before migrating to avoid performance issues.",
    weight: 7,
  },
  {
    label: "Unsupported network adapter type",
    category: "Other",
    description:
      "This VM uses a legacy network adapter type not recommended for migration.",
    assessment: "Update the network adapter type to VMXNET3 before migration.",
    weight: 4,
  },
];

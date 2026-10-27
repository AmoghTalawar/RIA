// KLE R&D Dashboard - Mock Data
// Data Dictionary based on Part C of design specifications

// Staff Dashboard Data
export const staffKPIs = {
  totalPubs: { value: 47, delta: 12, prevYear: 42 },
  scopusCitations: { value: 1234, delta: 18, prevYear: 1045 },
  hIndex: { value: 14, delta: 7, percentile: 85 },
  q1q2Percent: { value: 68, delta: 5, count: 32 },
  avgIF: { value: 3.45, delta: 8, deptAvg: 2.89 },
  i10Index: { value: 11, delta: 10, prevYear: 10 },
};

export const publicationsPerYear = [
  { year: '2019', Q1: 4, Q2: 6, Q3: 3, Q4: 2, total: 15 },
  { year: '2020', Q1: 5, Q2: 7, Q3: 4, Q4: 1, total: 17 },
  { year: '2021', Q1: 6, Q2: 5, Q3: 5, Q4: 2, total: 18 },
  { year: '2022', Q1: 8, Q2: 6, Q3: 4, Q4: 3, total: 21 },
  { year: '2023', Q1: 10, Q2: 8, Q3: 5, Q4: 2, total: 25 },
  { year: '2024', Q1: 12, Q2: 9, Q3: 6, Q4: 3, total: 30 },
  { year: '2025', Q1: 14, Q2: 10, Q3: 7, Q4: 4, total: 35 },
];

export const qRankDistribution = [
  { name: 'Q1', value: 18 },
  { name: 'Q2', value: 14 },
  { name: 'Q3', value: 8 },
  { name: 'Q4', value: 4 },
  { name: 'Unranked', value: 3 },
];

export const citationTrend = [
  { year: '2020', Scopus: 450, WoS: 380, 'Google Scholar': 620 },
  { year: '2021', Scopus: 580, WoS: 490, 'Google Scholar': 780 },
  { year: '2022', Scopus: 720, WoS: 610, 'Google Scholar': 950 },
  { year: '2023', Scopus: 890, WoS: 750, 'Google Scholar': 1150 },
  { year: '2024', Scopus: 1050, WoS: 890, 'Google Scholar': 1380 },
  { year: '2025', Scopus: 1234, WoS: 1045, 'Google Scholar': 1620 },
];

export const topPapers = [
  { id: 1, name: 'Deep Learning for Medical Image Analysis', value: 245, hIndex: 14, qRank: 'Q1', journal: 'IEEE Trans. Medical Imaging' },
  { id: 2, name: 'Machine Learning in Smart Grid Systems', value: 189, hIndex: 12, qRank: 'Q1', journal: 'Applied Energy' },
  { id: 3, name: 'IoT Security Framework for Healthcare', value: 156, hIndex: 11, qRank: 'Q2', journal: 'Computer Networks' },
  { id: 4, name: 'Renewable Energy Integration Strategies', value: 134, hIndex: 10, qRank: 'Q1', journal: 'Renewable Energy' },
  { id: 5, name: 'Neural Network Optimization Techniques', value: 121, hIndex: 9, qRank: 'Q2', journal: 'Neural Computing' },
  { id: 6, name: 'Blockchain for Supply Chain Management', value: 98, hIndex: 8, qRank: 'Q2', journal: 'Computers & Industrial Eng.' },
  { id: 7, name: 'Edge Computing in Industrial IoT', value: 87, hIndex: 7, qRank: 'Q2', journal: 'J. Industrial Info. Integration' },
  { id: 8, name: 'Smart City Infrastructure Design', value: 76, hIndex: 7, qRank: 'Q3', journal: 'Sustainable Cities & Society' },
  { id: 9, name: 'Wireless Sensor Network Protocols', value: 65, hIndex: 6, qRank: 'Q3', journal: 'Ad Hoc Networks' },
  { id: 10, name: 'Computer Vision for Agriculture', value: 54, hIndex: 5, qRank: 'Q2', journal: 'Computers & Electronics Agri.' },
];

export const scatterData = [
  { title: 'Deep Learning for Medical Imaging', impactFactor: 7.8, citations: 245, qRank: 'Q1', journal: 'IEEE TMI' },
  { title: 'ML in Smart Grid', impactFactor: 9.2, citations: 189, qRank: 'Q1', journal: 'Applied Energy' },
  { title: 'IoT Security Healthcare', impactFactor: 4.5, citations: 156, qRank: 'Q2', journal: 'Comp Networks' },
  { title: 'Renewable Energy', impactFactor: 8.1, citations: 134, qRank: 'Q1', journal: 'Renewable Energy' },
  { title: 'Neural Network Opt', impactFactor: 5.6, citations: 121, qRank: 'Q2', journal: 'Neural Computing' },
  { title: 'Blockchain Supply', impactFactor: 5.1, citations: 98, qRank: 'Q2', journal: 'C&IE' },
  { title: 'Edge Computing IoT', impactFactor: 4.8, citations: 87, qRank: 'Q2', journal: 'JIII' },
  { title: 'Smart City Design', impactFactor: 3.2, citations: 76, qRank: 'Q3', journal: 'SCS' },
  { title: 'WSN Protocols', impactFactor: 3.8, citations: 65, qRank: 'Q3', journal: 'Ad Hoc Networks' },
  { title: 'CV Agriculture', impactFactor: 4.9, citations: 54, qRank: 'Q2', journal: 'C&E Agri' },
  { title: 'Data Mining Health', impactFactor: 2.8, citations: 43, qRank: 'Q4', journal: 'Health Informatics' },
  { title: 'Signal Processing', impactFactor: 2.1, citations: 32, qRank: 'Q4', journal: 'Signal Processing' },
];

export const publicationsTableData = [
  { id: 1, title: 'Deep Learning for Medical Image Analysis: A Comprehensive Survey', year: 2024, journal: 'IEEE Trans. Medical Imaging', qRank: 'Q1', impactFactor: 7.8, citations: 245, doi: '10.1109/TMI.2024.001234' },
  { id: 2, title: 'Machine Learning Applications in Smart Grid Systems', year: 2024, journal: 'Applied Energy', qRank: 'Q1', impactFactor: 9.2, citations: 189, doi: '10.1016/j.apenergy.2024.001' },
  { id: 3, title: 'IoT Security Framework for Healthcare Applications', year: 2023, journal: 'Computer Networks', qRank: 'Q2', impactFactor: 4.5, citations: 156, doi: '10.1016/j.comnet.2023.109' },
  { id: 4, title: 'Renewable Energy Integration in Developing Countries', year: 2023, journal: 'Renewable Energy', qRank: 'Q1', impactFactor: 8.1, citations: 134, doi: '10.1016/j.renene.2023.045' },
  { id: 5, title: 'Optimization Techniques for Deep Neural Networks', year: 2023, journal: 'Neural Computing', qRank: 'Q2', impactFactor: 5.6, citations: 121, doi: '10.1007/s00521-023-0876' },
  { id: 6, title: 'Blockchain Technology for Supply Chain Management', year: 2022, journal: 'Computers & Industrial Engineering', qRank: 'Q2', impactFactor: 5.1, citations: 98, doi: '10.1016/j.cie.2022.108234' },
  { id: 7, title: 'Edge Computing Framework for Industrial IoT', year: 2022, journal: 'J. Industrial Info. Integration', qRank: 'Q2', impactFactor: 4.8, citations: 87, doi: '10.1016/j.jii.2022.100345' },
  { id: 8, title: 'Smart City Infrastructure Design Principles', year: 2022, journal: 'Sustainable Cities & Society', qRank: 'Q3', impactFactor: 3.2, citations: 76, doi: '10.1016/j.scs.2022.103890' },
  { id: 9, title: 'Energy Efficient Wireless Sensor Networks', year: 2021, journal: 'Ad Hoc Networks', qRank: 'Q3', impactFactor: 3.8, citations: 65, doi: '10.1016/j.adhoc.2021.102567' },
  { id: 10, title: 'Computer Vision Applications in Agriculture', year: 2021, journal: 'Computers & Electronics Agri.', qRank: 'Q2', impactFactor: 4.9, citations: 54, doi: '10.1016/j.compag.2021.106234' },
];

// Department Dashboard Data
export const departmentKPIs = {
  totalPubs: { value: 342, target: 400, delta: 15 },
  q1q2Percent: { value: 62, delta: 8 },
  avgHIndex: { value: 12.4, delta: 5, univAvg: 10.8 },
  activeResearchers: { value: 28, total: 35 },
  avgIF: { value: 3.21, delta: 6, univAvg: 2.95 },
  totalCitations: { value: 8450, delta: 22 },
};

export const facultyCategoryDistribution = [
  { name: 'SRG', value: 8, description: 'Senior Research Group' },
  { name: 'ERG', value: 12, description: 'Established Research Group' },
  { name: 'ERGWS', value: 6, description: 'ERG with Supervision' },
  { name: 'ERS', value: 5, description: 'Early Research Stage' },
  { name: 'IREF', value: 4, description: 'Independent Research Fellow' },
];

export const rBandDistribution = [
  { band: 'R1', count: 8, color: '#0F766E' },
  { band: 'R2', count: 12, color: '#B45309' },
  { band: 'R3', count: 10, color: '#D97706' },
  { band: 'R4', count: 5, color: '#B91C1C' },
];

export const facultyRankingData = [
  { name: 'Dr. Rajesh Kumar', value: 456, hIndex: 18, category: 'SRG' },
  { name: 'Dr. Priya Sharma', value: 389, hIndex: 16, category: 'SRG' },
  { name: 'Dr. Suresh Patil', value: 312, hIndex: 14, category: 'ERG' },
  { name: 'Dr. Anita Desai', value: 287, hIndex: 13, category: 'ERG' },
  { name: 'Dr. Vikram Singh', value: 245, hIndex: 12, category: 'ERG' },
  { name: 'Dr. Meena Rao', value: 223, hIndex: 11, category: 'ERGWS' },
  { name: 'Dr. Arun Joshi', value: 198, hIndex: 10, category: 'ERG' },
  { name: 'Dr. Kavita Nair', value: 176, hIndex: 9, category: 'ERGWS' },
  { name: 'Dr. Ramesh Gupta', value: 154, hIndex: 8, category: 'ERS' },
  { name: 'Dr. Sunita Hegde', value: 132, hIndex: 7, category: 'ERS' },
];

export const hIndexHistogram = [
  { range: '0-5', count: 5 },
  { range: '6-10', count: 12 },
  { range: '11-15', count: 10 },
  { range: '16-20', count: 6 },
  { range: '20+', count: 2 },
];

// ─────────────────────────────────────────────────────
// Department Dashboard (HoD) — Extended data matching PPT
// ─────────────────────────────────────────────────────

// Research Outcomes
export const deptResearchOutcomes = {
  publications: { target: 80, current: 10 },
  patents: { filed: 1, granted: 0 },
  citations: { target: 250, current: 60, status: 'Poor' }, // status: Poor / Average / Good / Excellent
};

// Avg h-Index by category (Scopus) — nested donut
export const deptAvgHIndex = [
  { name: 'SRG', value: 0.1, color: '#B91C1C' },
  { name: 'ERG', value: 0.2, color: '#D97706' },
  { name: 'ERS', value: 0.25, color: '#A3A300' },
  { name: 'IREF', value: 0.55, color: '#0F766E' },
  { name: 'Pre-IREF', value: 0.85, color: '#3730A3' },
  { name: 'NA', value: 0.05, color: '#15803D' },
];

// Quality of Publications by Quartiles (donut)
export const deptQualityQuartiles = [
  { name: 'Q1', value: 1, color: '#3730A3' },
  { name: 'Q2', value: 1, color: '#0F766E' },
  { name: 'Q3', value: 6, color: '#A8A29E' },
  { name: 'Q4', value: 2, color: '#D97706' },
];

// Publications in last 4 quartiles (year-based quarters)
export const deptPubsLastQuarters = [
  { quarter: '1', count: 23 },
  { quarter: '2', count: 18 },
  { quarter: '3', count: 12 },
  { quarter: '4', count: 15 },
  { quarter: '5', count: 10 },
];

// Number of Publications in last 3 years
export const deptPubsLastYears = [
  { year: '1', count: 60 },
  { year: '2', count: 98 },
  { year: '3', count: 68 },
  { year: '4', count: 10 },
];

// Faculty data: present and last 2 cycles
export const deptFacultyData = {
  current: {
    label: 'Current (2025-26)',
    totalFaculty: 75,
    categories: [
      { name: 'SRG', count: 8, color: '#B91C1C' },
      { name: 'ERG', count: 15, color: '#D97706' },
      { name: 'ERGWS', count: 12, color: '#A3A300' },
      { name: 'ERS', count: 18, color: '#0F766E' },
      { name: 'IREF', count: 10, color: '#3730A3' },
      { name: 'Pre-IREF', count: 8, color: '#78716C' },
      { name: 'NA', count: 4, color: '#A8A29E' },
    ],
  },
  cycle1: {
    label: 'Cycle 2024-25',
    totalFaculty: 72,
    categories: [
      { name: 'SRG', count: 7, color: '#B91C1C' },
      { name: 'ERG', count: 14, color: '#D97706' },
      { name: 'ERGWS', count: 11, color: '#A3A300' },
      { name: 'ERS', count: 17, color: '#0F766E' },
      { name: 'IREF', count: 12, color: '#3730A3' },
      { name: 'Pre-IREF', count: 7, color: '#78716C' },
      { name: 'NA', count: 4, color: '#A8A29E' },
    ],
  },
  cycle2: {
    label: 'Cycle 2023-24',
    totalFaculty: 68,
    categories: [
      { name: 'SRG', count: 6, color: '#B91C1C' },
      { name: 'ERG', count: 12, color: '#D97706' },
      { name: 'ERGWS', count: 10, color: '#A3A300' },
      { name: 'ERS', count: 16, color: '#0F766E' },
      { name: 'IREF', count: 14, color: '#3730A3' },
      { name: 'Pre-IREF', count: 6, color: '#78716C' },
      { name: 'NA', count: 4, color: '#A8A29E' },
    ],
  },
};

// Performance data: Avg score by category (university & department level)
export const deptPerformanceData = {
  current: {
    label: 'Current (2025-26)',
    university: [
      { category: 'SRG', avgScore: 78 },
      { category: 'ERG', avgScore: 64 },
      { category: 'ERGWS', avgScore: 52 },
      { category: 'ERS', avgScore: 42 },
      { category: 'IREF', avgScore: 48 },
      { category: 'Pre-IREF', avgScore: 35 },
    ],
    department: [
      { category: 'SRG', avgScore: 82 },
      { category: 'ERG', avgScore: 68 },
      { category: 'ERGWS', avgScore: 55 },
      { category: 'ERS', avgScore: 45 },
      { category: 'IREF', avgScore: 52 },
      { category: 'Pre-IREF', avgScore: 38 },
    ],
  },
  cycle1: {
    label: 'Cycle 2024-25',
    university: [
      { category: 'SRG', avgScore: 75 },
      { category: 'ERG', avgScore: 60 },
      { category: 'ERGWS', avgScore: 48 },
      { category: 'ERS', avgScore: 38 },
      { category: 'IREF', avgScore: 44 },
      { category: 'Pre-IREF', avgScore: 32 },
    ],
    department: [
      { category: 'SRG', avgScore: 79 },
      { category: 'ERG', avgScore: 64 },
      { category: 'ERGWS', avgScore: 51 },
      { category: 'ERS', avgScore: 41 },
      { category: 'IREF', avgScore: 48 },
      { category: 'Pre-IREF', avgScore: 35 },
    ],
  },
  cycle2: {
    label: 'Cycle 2023-24',
    university: [
      { category: 'SRG', avgScore: 72 },
      { category: 'ERG', avgScore: 56 },
      { category: 'ERGWS', avgScore: 44 },
      { category: 'ERS', avgScore: 35 },
      { category: 'IREF', avgScore: 40 },
      { category: 'Pre-IREF', avgScore: 28 },
    ],
    department: [
      { category: 'SRG', avgScore: 76 },
      { category: 'ERG', avgScore: 60 },
      { category: 'ERGWS', avgScore: 47 },
      { category: 'ERS', avgScore: 38 },
      { category: 'IREF', avgScore: 44 },
      { category: 'Pre-IREF', avgScore: 32 },
    ],
  },
};

// R-Band score distribution for department
export const deptScoreBands = {
  overall: { label: 'ECE 75', data: [
    { band: 'R1', range: '81-100', count: 15, color: '#0F766E' },
    { band: 'R2', range: '61-80', count: 20, color: '#3730A3' },
    { band: 'R3', range: '41-60', count: 35, color: '#B45309' },
    { band: 'R4', range: '<40', count: 5, color: '#B91C1C' },
  ]},
};

// Faculty category + score band breakdown (e.g., ERG -15 (20%))
export const deptCategoryScoreBands = [
  {
    category: 'SRG', count: 8, percentage: 10.7,
    bands: [
      { band: 'R1', count: 4 },
      { band: 'R2', count: 3 },
      { band: 'R3', count: 1 },
      { band: 'R4', count: 0 },
    ],
  },
  {
    category: 'ERG', count: 15, percentage: 20,
    bands: [
      { band: 'R1', count: 1 },
      { band: 'R2', count: 4 },
      { band: 'R3', count: 7 },
      { band: 'R4', count: 3 },
    ],
  },
  {
    category: 'ERGWS', count: 12, percentage: 16,
    bands: [
      { band: 'R1', count: 1 },
      { band: 'R2', count: 3 },
      { band: 'R3', count: 5 },
      { band: 'R4', count: 3 },
    ],
  },
  {
    category: 'ERS', count: 18, percentage: 24,
    bands: [
      { band: 'R1', count: 2 },
      { band: 'R2', count: 4 },
      { band: 'R3', count: 8 },
      { band: 'R4', count: 4 },
    ],
  },
  {
    category: 'IREF', count: 10, percentage: 13.3,
    bands: [
      { band: 'R1', count: 1 },
      { band: 'R2', count: 3 },
      { band: 'R3', count: 4 },
      { band: 'R4', count: 2 },
    ],
  },
  {
    category: 'Pre-IREF', count: 8, percentage: 10.7,
    bands: [
      { band: 'R1', count: 0 },
      { band: 'R2', count: 1 },
      { band: 'R3', count: 4 },
      { band: 'R4', count: 3 },
    ],
  },
  {
    category: 'NA', count: 4, percentage: 5.3,
    bands: [
      { band: 'R1', count: 0 },
      { band: 'R2', count: 0 },
      { band: 'R3', count: 2 },
      { band: 'R4', count: 2 },
    ],
  },
];

// Department faculty list (ranked by decrease in score) for table
export const deptFacultyList = [
  { rank: 1, name: 'Dr. Rajesh Kumar', category: 'SRG', score: 92, maxScore: 100, band: 'R1', pubs: 12, hIndex: 18, citations: 456 },
  { rank: 2, name: 'Dr. Anita Desai', category: 'ERG', score: 86, maxScore: 90, band: 'R1', pubs: 10, hIndex: 15, citations: 312 },
  { rank: 3, name: 'Dr. Priya Sharma', category: 'SRG', score: 82, maxScore: 100, band: 'R1', pubs: 11, hIndex: 16, citations: 389 },
  { rank: 4, name: 'Dr. Vikram Singh', category: 'ERG', score: 76, maxScore: 90, band: 'R2', pubs: 8, hIndex: 12, citations: 245 },
  { rank: 5, name: 'Dr. Suresh Patil', category: 'ERG', score: 72, maxScore: 90, band: 'R2', pubs: 9, hIndex: 14, citations: 287 },
  { rank: 6, name: 'Dr. Meena Rao', category: 'ERGWS', score: 68, maxScore: 85, band: 'R2', pubs: 7, hIndex: 11, citations: 223 },
  { rank: 7, name: 'Dr. Arun Joshi', category: 'ERS', score: 58, maxScore: 80, band: 'R3', pubs: 5, hIndex: 10, citations: 198 },
  { rank: 8, name: 'Dr. Kavita Nair', category: 'IREF', score: 52, maxScore: 75, band: 'R3', pubs: 4, hIndex: 9, citations: 176 },
  { rank: 9, name: 'Dr. Sunita Hegde', category: 'ERS', score: 48, maxScore: 80, band: 'R3', pubs: 4, hIndex: 7, citations: 132 },
  { rank: 10, name: 'Dr. Ramesh Gupta', category: 'Pre-IREF', score: 38, maxScore: 70, band: 'R4', pubs: 2, hIndex: 5, citations: 65 },
];

export const journalHeatmapData = [
  { journal: 'IEEE Trans. Neural Networks', 2021: 3, 2022: 4, 2023: 5, 2024: 6, 2025: 7 },
  { journal: 'Applied Energy', 2021: 2, 2022: 3, 2023: 4, 2024: 4, 2025: 5 },
  { journal: 'Computer Networks', 2021: 4, 2022: 3, 2023: 5, 2024: 6, 2025: 5 },
  { journal: 'Renewable Energy', 2021: 2, 2022: 2, 2023: 3, 2024: 4, 2025: 4 },
  { journal: 'J. Cleaner Production', 2021: 1, 2022: 2, 2023: 3, 2024: 3, 2025: 4 },
];

// Faculty Dean Dashboard Data
export const facultyBoardDepartments = [
  { name: 'ECE', fullName: 'Electronics & Communication Engineering' },
  { name: 'CSE', fullName: 'Computer Science & Engineering' },
  { name: 'ME', fullName: 'Mechanical Engineering' },
  { name: 'CE', fullName: 'Civil Engineering' },
  { name: 'EE', fullName: 'Electrical Engineering' },
];

export const radarChartData = {
  ECE: { Publications: 85, 'Impact Factor': 72, Citations: 78, 'H-Index': 80, 'Q1+Q2 %': 68 },
  CSE: { Publications: 92, 'Impact Factor': 65, Citations: 88, 'H-Index': 75, 'Q1+Q2 %': 72 },
  ME: { Publications: 68, 'Impact Factor': 58, Citations: 62, 'H-Index': 55, 'Q1+Q2 %': 48 },
  CE: { Publications: 55, 'Impact Factor': 45, Citations: 48, 'H-Index': 42, 'Q1+Q2 %': 38 },
  EE: { Publications: 72, 'Impact Factor': 62, Citations: 68, 'H-Index': 65, 'Q1+Q2 %': 55 },
};

export const departmentComparison = [
  { dept: 'ECE', 2023: 85, 2024: 95, 2025: 110 },
  { dept: 'CSE', 2023: 92, 2024: 105, 2025: 118 },
  { dept: 'ME', 2023: 52, 2024: 58, 2025: 65 },
  { dept: 'CE', 2023: 38, 2024: 42, 2025: 48 },
  { dept: 'EE', 2023: 62, 2024: 70, 2025: 78 },
];

// Faculty Dean Dashboard – stable data (replaces Math.random)
export const fdDeptRScoreBands = [
  { dept: 'ECE', R1: 7, R2: 9, R3: 5, R4: 2 },
  { dept: 'CSE', R1: 9, R2: 8, R3: 4, R4: 2 },
  { dept: 'ME',  R1: 3, R2: 6, R3: 7, R4: 4 },
  { dept: 'CE',  R1: 2, R2: 5, R3: 6, R4: 5 },
  { dept: 'EE',  R1: 5, R2: 7, R3: 5, R4: 3 },
];

export const fdDeptScatterData = [
  { dept: 'ECE', avgIF: 3.82, avgCitations: 285, totalPubs: 110 },
  { dept: 'CSE', avgIF: 4.15, avgCitations: 320, totalPubs: 118 },
  { dept: 'ME',  avgIF: 2.78, avgCitations: 180, totalPubs: 65 },
  { dept: 'CE',  avgIF: 2.35, avgCitations: 142, totalPubs: 48 },
  { dept: 'EE',  avgIF: 3.20, avgCitations: 225, totalPubs: 78 },
];

export const fdDeptCategoryMix = [
  { dept: 'ECE', SRG: 4, ERG: 7, ERGWS: 3, ERS: 5, IREF: 3, 'Pre-IREF': 4, NA: 1 },
  { dept: 'CSE', SRG: 6, ERG: 8, ERGWS: 4, ERS: 3, IREF: 4, 'Pre-IREF': 3, NA: 2 },
  { dept: 'ME',  SRG: 2, ERG: 5, ERGWS: 2, ERS: 6, IREF: 2, 'Pre-IREF': 5, NA: 3 },
  { dept: 'CE',  SRG: 1, ERG: 3, ERGWS: 2, ERS: 5, IREF: 2, 'Pre-IREF': 4, NA: 4 },
  { dept: 'EE',  SRG: 3, ERG: 6, ERGWS: 3, ERS: 4, IREF: 3, 'Pre-IREF': 3, NA: 2 },
];

export const fdTargets = {
  publications: { current: 419, target: 520, period: 'FY 2025-26' },
  q1q2Percent:  { current: 58, target: 65, period: 'FY 2025-26' },
  avgHIndex:    { current: 11.8, target: 14, period: 'FY 2025-26' },
  activeFaculty:{ current: 72, target: 85, period: 'FY 2025-26' },
};

// Executive Dean Dashboard Data
export const facultyBoards = [
  { name: 'Applied Engineering', shortName: 'ApplEng', actual: 280, target: 350 },
  { name: 'Electrical Engineering', shortName: 'EE', actual: 220, target: 250 },
  { name: 'Computer Engineering', shortName: 'CompEng', actual: 310, target: 320 },
  { name: 'Communication & Mgmt', shortName: 'CommMgmt', actual: 85, target: 120 },
  { name: 'Science & Technology', shortName: 'SciTech', actual: 145, target: 180 },
  { name: 'Law', shortName: 'Law', actual: 42, target: 60 },
  { name: 'Architecture', shortName: 'Arch', actual: 28, target: 40 },
];

export const campusCitationTarget = {
  actual: 25600,
  target: 30000,
  previousYear: 21200,
};

// Faculty board Q-rank breakdown (stable, replaces Math.random in treemap/donut)
export const facultyBoardQRanks = [
  { shortName: 'ApplEng', Q1: 98, Q2: 78, Q3: 62, Q4: 42, avgQRank: 1.8, avgIF: 3.52 },
  { shortName: 'EE',      Q1: 77, Q2: 62, Q3: 48, Q4: 33, avgQRank: 1.9, avgIF: 3.14 },
  { shortName: 'CompEng', Q1: 112, Q2: 87, Q3: 68, Q4: 43, avgQRank: 1.7, avgIF: 4.21 },
  { shortName: 'CommMgmt', Q1: 25, Q2: 24, Q3: 20, Q4: 16, avgQRank: 2.3, avgIF: 2.45 },
  { shortName: 'SciTech', Q1: 48, Q2: 42, Q3: 32, Q4: 23, avgQRank: 2.1, avgIF: 2.88 },
  { shortName: 'Law',     Q1: 12, Q2: 12, Q3: 10, Q4: 8,  avgQRank: 2.4, avgIF: 2.12 },
  { shortName: 'Arch',    Q1: 8,  Q2: 8,  Q3: 7,  Q4: 5,  avgQRank: 2.5, avgIF: 1.85 },
];

// Executive Dean campus targets
export const execDeanTargets = {
  publications: { current: 1110, target: 1320, period: 'FY 2025-26' },
  citations: { current: 25600, target: 30000, period: 'FY 2025-26' },
  q1Percent: { current: 34, target: 40, period: 'FY 2025-26' },
  activeResearchers: { current: 245, target: 312, period: 'FY 2025-26' },
};

// Researcher category distribution across campus
export const campusCategoryDist = [
  { name: 'SRG', value: 28, color: '#B91C1C' },
  { name: 'ERG', value: 45, color: '#D97706' },
  { name: 'ERGWS', value: 32, color: '#A3A300' },
  { name: 'ERS', value: 68, color: '#0F766E' },
  { name: 'IREF', value: 52, color: '#3730A3' },
  { name: 'Pre-IREF', value: 62, color: '#6D28D9' },
  { name: 'NA', value: 25, color: '#78716C' },
];

// University Dashboard Data

// Stable heatmap data (replaces Math.random)
export const campusFacultyHeatmapData = [
  { facultyBoard: 'Applied Eng',   'BVB Hubli': 142, Belagavi: 58, Bengaluru: 28 },
  { facultyBoard: 'Electrical',    'BVB Hubli': 118, Belagavi: 45, Bengaluru: 22 },
  { facultyBoard: 'Computer Eng',  'BVB Hubli': 165, Belagavi: 72, Bengaluru: 35 },
  { facultyBoard: 'Comm & Mgmt',   'BVB Hubli': 78,  Belagavi: 32, Bengaluru: 15 },
  { facultyBoard: 'Sci & Tech',    'BVB Hubli': 95,  Belagavi: 38, Bengaluru: 18 },
  { facultyBoard: 'Law',           'BVB Hubli': 52,  Belagavi: 25, Bengaluru: 42 },
  { facultyBoard: 'Architecture',  'BVB Hubli': 45,  Belagavi: 28, Bengaluru: 12 },
];

// Research landscape scatter data (replaces hardcoded inline data)
export const universityResearchLandscape = [
  { name: 'CSE', campus: 'BVB', pubs: 118, citations: 3200, faculty: 35, hIndex: 14.2 },
  { name: 'ECE', campus: 'BVB', pubs: 110, citations: 2850, faculty: 32, hIndex: 12.8 },
  { name: 'ME',  campus: 'BVB', pubs: 65,  citations: 1890, faculty: 28, hIndex: 10.5 },
  { name: 'EE',  campus: 'BVB', pubs: 78,  citations: 2180, faculty: 25, hIndex: 11.5 },
  { name: 'CE',  campus: 'BVB', pubs: 48,  citations: 1245, faculty: 22, hIndex: 8.2 },
  { name: 'CSE', campus: 'Belagavi', pubs: 85, citations: 1950, faculty: 18, hIndex: 10.5 },
  { name: 'ECE', campus: 'Belagavi', pubs: 72, citations: 1680, faculty: 15, hIndex: 9.2 },
  { name: 'Law', campus: 'Bengaluru', pubs: 42, citations: 820,  faculty: 12, hIndex: 6.8 },
  { name: 'ME',  campus: 'Belagavi', pubs: 38, citations: 980,  faculty: 14, hIndex: 7.4 },
  { name: 'Arch', campus: 'Bengaluru', pubs: 28, citations: 520, faculty: 10, hIndex: 5.1 },
];

// NIRF trajectory data
export const nirfTrajectory = [
  { year: '2020', rank: 185, score: 42.3, band: 'B' },
  { year: '2021', rank: 162, score: 45.8, band: 'B' },
  { year: '2022', rank: 148, score: 48.2, band: 'B' },
  { year: '2023', rank: 128, score: 52.1, band: 'A' },
  { year: '2024', rank: 112, score: 55.8, band: 'A' },
  { year: '2025', rank: 98,  score: 58.4, band: 'A' },
];

// Funding portfolio data
export const universityFundingPortfolio = [
  { name: 'DST',  value: 4.2, projects: 12 },
  { name: 'AICTE', value: 2.8, projects: 8 },
  { name: 'UGC',  value: 1.5, projects: 5 },
  { name: 'Industry', value: 3.6, projects: 15 },
  { name: 'CSIR', value: 1.2, projects: 4 },
  { name: 'International', value: 2.1, projects: 6 },
];

// PhD pipeline data (university-wide)
export const universityPhDPipeline = {
  total: 185,
  stages: [
    { stage: 'Coursework', count: 32, color: '#3730A3' },
    { stage: 'Comprehensive Exam', count: 28, color: '#0F766E' },
    { stage: 'Proposal Defence', count: 25, color: '#B45309' },
    { stage: 'Research Phase', count: 62, color: '#B91C1C' },
    { stage: 'Pre-submission', count: 22, color: '#15803D' },
    { stage: 'Thesis Submitted', count: 16, color: '#6D28D9' },
  ],
  completedThisYear: 14,
  avgDuration: 4.8,
  onTrack: 128,
  delayed: 42,
  critical: 15,
};

// H-Index trend data (stable, replaces hardcoded inline)
export const universityHIndexTrend = [
  { year: '2021', BVB: 9.2, Belagavi: 7.5, Bengaluru: 5.8 },
  { year: '2022', BVB: 10.2, Belagavi: 8.5, Bengaluru: 6.8 },
  { year: '2023', BVB: 11.1, Belagavi: 9.2, Bengaluru: 7.4 },
  { year: '2024', BVB: 12.0, Belagavi: 9.8, Bengaluru: 8.1 },
  { year: '2025', BVB: 12.8, Belagavi: 10.5, Bengaluru: 8.9 },
];

// Peer institution comparison
export const peerComparison = [
  { name: 'KLE Tech', publications: 1245, citations: 48500, hIndex: 45, q1Percent: 42, patents: 18 },
  { name: 'NITK Surathkal', publications: 1580, citations: 62000, hIndex: 52, q1Percent: 48, patents: 24 },
  { name: 'BMS College', publications: 920, citations: 35200, hIndex: 38, q1Percent: 35, patents: 12 },
  { name: 'SDM College', publications: 680, citations: 22800, hIndex: 32, q1Percent: 28, patents: 8 },
  { name: 'RVCE', publications: 1120, citations: 42600, hIndex: 42, q1Percent: 40, patents: 15 },
];

// University targets for traffic-light tracking
export const universityTargets = {
  publications: { current: 1245, target: 1500, period: 'FY 2025-26' },
  citations: { current: 48500, target: 55000, period: 'FY 2025-26' },
  hIndex: { current: 45, target: 50, period: 'FY 2025-26' },
  q1Percent: { current: 42, target: 50, period: 'FY 2025-26' },
  fundingCrore: { current: 15.4, target: 20, period: 'FY 2025-26' },
  nirfRank: { current: 98, target: 75, period: '2026', invert: true },
  patents: { current: 18, target: 25, period: 'FY 2025-26' },
  phdCompletions: { current: 14, target: 20, period: 'FY 2025-26' },
};

export const universityKPIs = {
  totalPubs: { value: 1245, delta: 15 },
  univHIndex: { value: 45, delta: 8 },
  totalCitations: { value: 48500, delta: 22 },
  q1Percent: { value: 42, delta: 5 },
  campusSplit: { bvb: 68, belagavi: 24, bengaluru: 8 },
  yoyGrowth: { value: 18 },
  srgDensity: { value: 12.5, unit: '%' },
  cagr5y: { value: 14.2 },
};

export const campusData = [
  { name: 'BVB Hubli', actual: 845, target: 900, color: '#B91C1C' },
  { name: 'Belagavi', actual: 298, target: 300, color: '#3730A3' },
  { name: 'Bengaluru', actual: 102, target: 120, color: '#0F766E' },
];

export const campusTrend = [
  { year: '2021', BVB: 580, Belagavi: 185, Bengaluru: 62 },
  { year: '2022', BVB: 645, Belagavi: 210, Bengaluru: 75 },
  { year: '2023', BVB: 720, Belagavi: 245, Bengaluru: 85 },
  { year: '2024', BVB: 785, Belagavi: 275, Bengaluru: 95 },
  { year: '2025', BVB: 845, Belagavi: 298, Bengaluru: 102 },
];

export const universityQRankDistribution = [
  { name: 'Q1', value: 523 },
  { name: 'Q2', value: 374 },
  { name: 'Q3', value: 223 },
  { name: 'Q4', value: 98 },
  { name: 'Unranked', value: 27 },
];

export const topUniversityFaculty = [
  { name: 'Dr. Rajesh Kumar', value: 856, campus: 'BVB', department: 'CSE' },
  { name: 'Dr. Priya Sharma', value: 745, campus: 'BVB', department: 'ECE' },
  { name: 'Dr. Suresh Patil', value: 678, campus: 'BVB', department: 'ME' },
  { name: 'Dr. Anita Desai', value: 612, campus: 'Belagavi', department: 'CSE' },
  { name: 'Dr. Vikram Singh', value: 589, campus: 'BVB', department: 'EE' },
  { name: 'Dr. Meena Rao', value: 534, campus: 'BVB', department: 'CSE' },
  { name: 'Dr. Arun Joshi', value: 498, campus: 'Belagavi', department: 'ECE' },
  { name: 'Dr. Kavita Nair', value: 456, campus: 'BVB', department: 'CE' },
  { name: 'Dr. Ramesh Gupta', value: 423, campus: 'Bengaluru', department: 'Law' },
  { name: 'Dr. Sunita Hegde', value: 398, campus: 'BVB', department: 'CSE' },
];

// ─────────────────────────────────────────────
// Staff Dashboard: Faculty Research Score Data
// ─────────────────────────────────────────────

// Faculty profile info
export const facultyProfile = {
  name: 'Dr. Rajesh Kumar',
  school: 'School of Computer Science & Engineering',
  department: 'CSE',
  category: 'SRG', // SRG | ERG | ERGWS | ERS | ERS-prep | IREF | pre-IREF
  maxResearchScore: 100,
  scoreOfFaculty: 82,
  avgScoreUniversity: 64,
  avgScoreDept: 72,
  positionInCategory: '3 / 8', // Position / Maximum number in the category
};

// Research Parameter definitions per category
// P3 label varies by category:
//   - SRG / ERG with student: "No of PhD Student"
//   - ERG without student: "proposal submitted/granted"
//   - ERS / IREF / pre-IREF etc.: "proposal submitted/granted"
export const categoryParameterLabels = {
  SRG: {
    P1: 'Research plan',
    P2: 'Publication',
    P3: 'No of PhD Student',
    P4: 'Research Grant',
    P5: 'Progress of REU/IRP/IREF',
    P6: 'Lead / Contribution to IRP / sponsored projects',
    P7: 'Participation in departmental / institutional colloquium',
  },
  'ERG-with-student': {
    P1: 'Research plan',
    P2: 'Publication',
    P3: 'No of PhD Student',
    P4: 'Research Grant',
    P5: 'Progress of REU/IRP/IREF',
    P6: 'Lead / Contribution to IRP / sponsored projects',
    P7: 'Participation in departmental / institutional colloquium',
  },
  'ERG-without-student': {
    P1: 'Research plan',
    P2: 'Publication',
    P3: 'proposal submitted/granted',
    P4: 'Research Grant',
    P5: 'Progress of REU/IRP/IREF',
    P6: 'Lead / Contribution to IRP / sponsored projects',
    P7: 'Participation in departmental / institutional colloquium',
  },
  ERS: {
    P1: 'Research plan',
    P2: 'Publication',
    P3: 'proposal submitted/granted',
    P4: 'Research Grant',
    P5: 'Progress of REU/IRP/IREF',
    P6: 'Lead / Contribution to IRP / sponsored projects',
    P7: 'Participation in departmental / institutional colloquium',
  },
  IREF: {
    P1: 'Research plan',
    P2: 'Publication',
    P3: 'proposal submitted/granted',
    P4: 'Research Grant',
    P5: 'Progress of REU/IRP/IREF',
    P6: 'Lead / Contribution to IRP / sponsored projects',
    P7: 'Participation in departmental / institutional colloquium',
  },
  'pre-IREF': {
    P1: 'Research plan',
    P2: 'Publication',
    P3: 'proposal submitted/granted',
    P4: 'Research Grant',
    P5: 'Progress of REU/IRP/IREF',
    P6: 'Lead / Contribution to IRP / sponsored projects',
    P7: 'Participation in departmental / institutional colloquium',
  },
};

// Research parameter scores: Review 1, Review 2, Previous 2 cycles
// Separate data sets for ERG-with-student vs ERG-without-student (P3 differs)
export const facultyParameterScores = {
  review1: {
    label: 'Review 1 (Jul–Dec 2025)',
    scores: [
      { faculty: 'Dr. Rajesh Kumar', school: 'CSE', score: 82, category: 'SRG', P1: { obt: 8, max: 10 }, P2: { obt: 18, max: 20 }, P3: { obt: 12, max: 15 }, P4: { obt: 14, max: 15 }, P5: { obt: 12, max: 15 }, P6: { obt: 10, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Priya Sharma', school: 'ECE', score: 76, category: 'SRG', P1: { obt: 7, max: 10 }, P2: { obt: 16, max: 20 }, P3: { obt: 11, max: 15 }, P4: { obt: 13, max: 15 }, P5: { obt: 11, max: 15 }, P6: { obt: 10, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Suresh Patil', school: 'ME', score: 68, category: 'ERG', ergType: 'with-student', P1: { obt: 6, max: 10 }, P2: { obt: 14, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 11, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Anita Desai', school: 'CSE', score: 74, category: 'ERG', ergType: 'without-student', P1: { obt: 7, max: 10 }, P2: { obt: 15, max: 20 }, P3: { obt: 12, max: 15 }, P4: { obt: 12, max: 15 }, P5: { obt: 11, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Vikram Singh', school: 'EE', score: 71, category: 'ERG', ergType: 'with-student', P1: { obt: 7, max: 10 }, P2: { obt: 14, max: 20 }, P3: { obt: 11, max: 15 }, P4: { obt: 12, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Meena Rao', school: 'CSE', score: 58, category: 'ERGWS', P1: { obt: 5, max: 10 }, P2: { obt: 12, max: 20 }, P3: { obt: 8, max: 15 }, P4: { obt: 10, max: 15 }, P5: { obt: 9, max: 15 }, P6: { obt: 7, max: 15 }, P7: { obt: 7, max: 10 } },
      { faculty: 'Dr. Arun Joshi', school: 'ME', score: 45, category: 'ERS', P1: { obt: 4, max: 10 }, P2: { obt: 10, max: 20 }, P3: { obt: 6, max: 15 }, P4: { obt: 8, max: 15 }, P5: { obt: 7, max: 15 }, P6: { obt: 5, max: 15 }, P7: { obt: 5, max: 10 } },
      { faculty: 'Dr. Kavita Nair', school: 'ECE', score: 52, category: 'IREF', P1: { obt: 5, max: 10 }, P2: { obt: 11, max: 20 }, P3: { obt: 7, max: 15 }, P4: { obt: 9, max: 15 }, P5: { obt: 8, max: 15 }, P6: { obt: 6, max: 15 }, P7: { obt: 6, max: 10 } },
      { faculty: 'Dr. Ramesh Gupta', school: 'CE', score: 38, category: 'pre-IREF', P1: { obt: 3, max: 10 }, P2: { obt: 8, max: 20 }, P3: { obt: 5, max: 15 }, P4: { obt: 7, max: 15 }, P5: { obt: 6, max: 15 }, P6: { obt: 4, max: 15 }, P7: { obt: 5, max: 10 } },
    ],
  },
  review2: {
    label: 'Review 2 (Jan–Jun 2025)',
    scores: [
      { faculty: 'Dr. Rajesh Kumar', school: 'CSE', score: 78, category: 'SRG', P1: { obt: 7, max: 10 }, P2: { obt: 17, max: 20 }, P3: { obt: 11, max: 15 }, P4: { obt: 13, max: 15 }, P5: { obt: 12, max: 15 }, P6: { obt: 10, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Priya Sharma', school: 'ECE', score: 72, category: 'SRG', P1: { obt: 7, max: 10 }, P2: { obt: 15, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 12, max: 15 }, P5: { obt: 11, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Suresh Patil', school: 'ME', score: 64, category: 'ERG', ergType: 'with-student', P1: { obt: 6, max: 10 }, P2: { obt: 13, max: 20 }, P3: { obt: 9, max: 15 }, P4: { obt: 10, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 8, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Anita Desai', school: 'CSE', score: 70, category: 'ERG', ergType: 'without-student', P1: { obt: 7, max: 10 }, P2: { obt: 14, max: 20 }, P3: { obt: 11, max: 15 }, P4: { obt: 11, max: 15 }, P5: { obt: 11, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 7, max: 10 } },
      { faculty: 'Dr. Vikram Singh', school: 'EE', score: 66, category: 'ERG', ergType: 'with-student', P1: { obt: 6, max: 10 }, P2: { obt: 13, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 11, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 8, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Meena Rao', school: 'CSE', score: 54, category: 'ERGWS', P1: { obt: 5, max: 10 }, P2: { obt: 11, max: 20 }, P3: { obt: 7, max: 15 }, P4: { obt: 9, max: 15 }, P5: { obt: 9, max: 15 }, P6: { obt: 7, max: 15 }, P7: { obt: 6, max: 10 } },
      { faculty: 'Dr. Arun Joshi', school: 'ME', score: 42, category: 'ERS', P1: { obt: 4, max: 10 }, P2: { obt: 9, max: 20 }, P3: { obt: 5, max: 15 }, P4: { obt: 8, max: 15 }, P5: { obt: 6, max: 15 }, P6: { obt: 5, max: 15 }, P7: { obt: 5, max: 10 } },
      { faculty: 'Dr. Kavita Nair', school: 'ECE', score: 48, category: 'IREF', P1: { obt: 4, max: 10 }, P2: { obt: 10, max: 20 }, P3: { obt: 6, max: 15 }, P4: { obt: 9, max: 15 }, P5: { obt: 8, max: 15 }, P6: { obt: 5, max: 15 }, P7: { obt: 6, max: 10 } },
      { faculty: 'Dr. Ramesh Gupta', school: 'CE', score: 35, category: 'pre-IREF', P1: { obt: 3, max: 10 }, P2: { obt: 7, max: 20 }, P3: { obt: 4, max: 15 }, P4: { obt: 6, max: 15 }, P5: { obt: 6, max: 15 }, P6: { obt: 4, max: 15 }, P7: { obt: 5, max: 10 } },
    ],
  },
  previous1: {
    label: 'Cycle 2024-25',
    scores: [
      { faculty: 'Dr. Rajesh Kumar', school: 'CSE', score: 75, category: 'SRG', P1: { obt: 7, max: 10 }, P2: { obt: 16, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 12, max: 15 }, P5: { obt: 11, max: 15 }, P6: { obt: 10, max: 15 }, P7: { obt: 9, max: 10 } },
      { faculty: 'Dr. Priya Sharma', school: 'ECE', score: 70, category: 'SRG', P1: { obt: 7, max: 10 }, P2: { obt: 14, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 11, max: 15 }, P5: { obt: 11, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Suresh Patil', school: 'ME', score: 62, category: 'ERG', ergType: 'with-student', P1: { obt: 5, max: 10 }, P2: { obt: 13, max: 20 }, P3: { obt: 9, max: 15 }, P4: { obt: 10, max: 15 }, P5: { obt: 9, max: 15 }, P6: { obt: 8, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Anita Desai', school: 'CSE', score: 66, category: 'ERG', ergType: 'without-student', P1: { obt: 6, max: 10 }, P2: { obt: 14, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 10, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 7, max: 10 } },
    ],
  },
  previous2: {
    label: 'Cycle 2023-24',
    scores: [
      { faculty: 'Dr. Rajesh Kumar', school: 'CSE', score: 71, category: 'SRG', P1: { obt: 6, max: 10 }, P2: { obt: 15, max: 20 }, P3: { obt: 10, max: 15 }, P4: { obt: 12, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 10, max: 15 }, P7: { obt: 8, max: 10 } },
      { faculty: 'Dr. Priya Sharma', school: 'ECE', score: 66, category: 'SRG', P1: { obt: 6, max: 10 }, P2: { obt: 13, max: 20 }, P3: { obt: 9, max: 15 }, P4: { obt: 11, max: 15 }, P5: { obt: 10, max: 15 }, P6: { obt: 9, max: 15 }, P7: { obt: 8, max: 10 } },
    ],
  },
};

// Quarterly comparison: last 5 quarters Q-rank publication counts
export const quarterlyQRankComparison = [
  { quarter: 'Q3 2024', Q1: 8, Q2: 5, Q3: 3, Q4: 1 },
  { quarter: 'Q4 2024', Q1: 10, Q2: 6, Q3: 4, Q4: 2 },
  { quarter: 'Q1 2025', Q1: 11, Q2: 7, Q3: 3, Q4: 1 },
  { quarter: 'Q2 2025', Q1: 12, Q2: 8, Q3: 4, Q4: 2 },
  { quarter: 'Q3 2025', Q1: 14, Q2: 10, Q3: 5, Q4: 2 },
];

// 3-year comparison for key metrics — expanded to 7 years for dynamic range
export const multiYearComparison = {
  years: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
  papers:     [15, 17, 18, 21, 25, 35, 47],
  hIndex:     [6, 7, 8, 9, 10, 12, 14],
  citations:  [320, 410, 520, 640, 780, 1050, 1234],
  q1Percent:  [18, 22, 26, 30, 32, 40, 42],
  avgIF:      [2.10, 2.35, 2.52, 2.68, 2.85, 3.12, 3.45],
  i10Index:   [3, 4, 5, 6, 8, 10, 11],
};

// ─────────────────────────────────────────────
// Year-based Research Outcomes (dynamic year selector)
// ─────────────────────────────────────────────
export const deptResearchOutcomesByYear = {
  2021: {
    publications: { target: 60, current: 32 },
    patents: { filed: 0, granted: 0 },
    citations: { target: 180, current: 85, status: 'Average' },
    avgHIndex: [
      { name: 'SRG', value: 0.08, color: '#B91C1C' },
      { name: 'ERG', value: 0.15, color: '#D97706' },
      { name: 'ERS', value: 0.2, color: '#A3A300' },
      { name: 'IREF', value: 0.4, color: '#0F766E' },
      { name: 'Pre-IREF', value: 0.7, color: '#3730A3' },
      { name: 'NA', value: 0.04, color: '#15803D' },
    ],
    qualityQuartiles: [
      { name: 'Q1', value: 2, color: '#3730A3' },
      { name: 'Q2', value: 5, color: '#0F766E' },
      { name: 'Q3', value: 12, color: '#A8A29E' },
      { name: 'Q4', value: 6, color: '#D97706' },
    ],
    pubsLastQuarters: [
      { quarter: '1', count: 10 },
      { quarter: '2', count: 8 },
      { quarter: '3', count: 6 },
      { quarter: '4', count: 8 },
    ],
    pubsLastYears: [
      { year: '2019', count: 22 },
      { year: '2020', count: 28 },
      { year: '2021', count: 32 },
    ],
  },
  2022: {
    publications: { target: 65, current: 45 },
    patents: { filed: 1, granted: 0 },
    citations: { target: 200, current: 110, status: 'Average' },
    avgHIndex: [
      { name: 'SRG', value: 0.09, color: '#B91C1C' },
      { name: 'ERG', value: 0.18, color: '#D97706' },
      { name: 'ERS', value: 0.22, color: '#A3A300' },
      { name: 'IREF', value: 0.48, color: '#0F766E' },
      { name: 'Pre-IREF', value: 0.78, color: '#3730A3' },
      { name: 'NA', value: 0.04, color: '#15803D' },
    ],
    qualityQuartiles: [
      { name: 'Q1', value: 3, color: '#3730A3' },
      { name: 'Q2', value: 6, color: '#0F766E' },
      { name: 'Q3', value: 18, color: '#A8A29E' },
      { name: 'Q4', value: 8, color: '#D97706' },
    ],
    pubsLastQuarters: [
      { quarter: '1', count: 14 },
      { quarter: '2', count: 12 },
      { quarter: '3', count: 8 },
      { quarter: '4', count: 11 },
    ],
    pubsLastYears: [
      { year: '2020', count: 28 },
      { year: '2021', count: 32 },
      { year: '2022', count: 45 },
    ],
  },
  2023: {
    publications: { target: 80, current: 10 },
    patents: { filed: 1, granted: 0 },
    citations: { target: 250, current: 60, status: 'Poor' },
    avgHIndex: [
      { name: 'SRG', value: 0.1, color: '#B91C1C' },
      { name: 'ERG', value: 0.2, color: '#D97706' },
      { name: 'ERS', value: 0.25, color: '#A3A300' },
      { name: 'IREF', value: 0.55, color: '#0F766E' },
      { name: 'Pre-IREF', value: 0.85, color: '#3730A3' },
      { name: 'NA', value: 0.05, color: '#15803D' },
    ],
    qualityQuartiles: [
      { name: 'Q1', value: 1, color: '#3730A3' },
      { name: 'Q2', value: 1, color: '#0F766E' },
      { name: 'Q3', value: 6, color: '#A8A29E' },
      { name: 'Q4', value: 2, color: '#D97706' },
    ],
    pubsLastQuarters: [
      { quarter: '1', count: 23 },
      { quarter: '2', count: 18 },
      { quarter: '3', count: 12 },
      { quarter: '4', count: 15 },
      { quarter: '5', count: 10 },
    ],
    pubsLastYears: [
      { year: '2021', count: 60 },
      { year: '2022', count: 98 },
      { year: '2023', count: 68 },
      { year: '2024', count: 10 },
    ],
  },
  2024: {
    publications: { target: 90, current: 62 },
    patents: { filed: 2, granted: 1 },
    citations: { target: 300, current: 195, status: 'Good' },
    avgHIndex: [
      { name: 'SRG', value: 0.12, color: '#B91C1C' },
      { name: 'ERG', value: 0.24, color: '#D97706' },
      { name: 'ERS', value: 0.28, color: '#A3A300' },
      { name: 'IREF', value: 0.6, color: '#0F766E' },
      { name: 'Pre-IREF', value: 0.9, color: '#3730A3' },
      { name: 'NA', value: 0.06, color: '#15803D' },
    ],
    qualityQuartiles: [
      { name: 'Q1', value: 8, color: '#3730A3' },
      { name: 'Q2', value: 12, color: '#0F766E' },
      { name: 'Q3', value: 22, color: '#A8A29E' },
      { name: 'Q4', value: 10, color: '#D97706' },
    ],
    pubsLastQuarters: [
      { quarter: '1', count: 18 },
      { quarter: '2', count: 16 },
      { quarter: '3', count: 14 },
      { quarter: '4', count: 14 },
    ],
    pubsLastYears: [
      { year: '2022', count: 45 },
      { year: '2023', count: 68 },
      { year: '2024', count: 62 },
    ],
  },
  2025: {
    publications: { target: 100, current: 78 },
    patents: { filed: 3, granted: 2 },
    citations: { target: 350, current: 280, status: 'Good' },
    avgHIndex: [
      { name: 'SRG', value: 0.15, color: '#B91C1C' },
      { name: 'ERG', value: 0.28, color: '#D97706' },
      { name: 'ERS', value: 0.32, color: '#A3A300' },
      { name: 'IREF', value: 0.65, color: '#0F766E' },
      { name: 'Pre-IREF', value: 0.95, color: '#3730A3' },
      { name: 'NA', value: 0.07, color: '#15803D' },
    ],
    qualityQuartiles: [
      { name: 'Q1', value: 12, color: '#3730A3' },
      { name: 'Q2', value: 18, color: '#0F766E' },
      { name: 'Q3', value: 28, color: '#A8A29E' },
      { name: 'Q4', value: 12, color: '#D97706' },
    ],
    pubsLastQuarters: [
      { quarter: '1', count: 22 },
      { quarter: '2', count: 20 },
      { quarter: '3', count: 18 },
      { quarter: '4', count: 18 },
    ],
    pubsLastYears: [
      { year: '2023', count: 68 },
      { year: '2024', count: 62 },
      { year: '2025', count: 78 },
    ],
  },
};

// Department-level faculty list for the score table
export const departmentFacultyScores = [
  { name: 'Dr. Rajesh Kumar', category: 'SRG', score: 82, maxScore: 100, avgCat: 74, rank: 3 },
  { name: 'Dr. Priya Sharma', category: 'SRG', score: 76, maxScore: 100, avgCat: 74, rank: 5 },
  { name: 'Dr. Suresh Patil', category: 'ERG', score: 68, maxScore: 90, avgCat: 62, rank: 2 },
  { name: 'Dr. Anita Desai', category: 'ERG', score: 74, maxScore: 90, avgCat: 62, rank: 1 },
  { name: 'Dr. Vikram Singh', category: 'ERG', score: 71, maxScore: 90, avgCat: 62, rank: 3 },
  { name: 'Dr. Meena Rao', category: 'ERGWS', score: 58, maxScore: 85, avgCat: 52, rank: 1 },
  { name: 'Dr. Arun Joshi', category: 'ERS', score: 45, maxScore: 80, avgCat: 42, rank: 2 },
  { name: 'Dr. Kavita Nair', category: 'IREF', score: 52, maxScore: 75, avgCat: 48, rank: 1 },
  { name: 'Dr. Ramesh Gupta', category: 'pre-IREF', score: 38, maxScore: 70, avgCat: 35, rank: 2 },
  { name: 'Dr. Sunita Hegde', category: 'ERS', score: 48, maxScore: 80, avgCat: 42, rank: 1 },
];

# KLE R&D Dashboard - Project Instructions & Flow

This document provides comprehensive instructions on how to set up, run, and understand the flow of the KLE R&D Dashboard project.

## 1. Prerequisites
Before running the project, make sure you have the following installed on your system:
- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node.js)

## 2. Installation & Setup
1. Open your terminal or command prompt.
2. Navigate to the project root directory:
   ```bash
   cd "d:\BvB\R&D Project\Development\kle-rd-dashboard"
   ```
3. Install the required dependencies:
   ```bash
   npm install
   ```

## 3. How to Run the Project

### Development Mode
To start the local development server with hot-reloading:
```bash
npm run dev
```
Once the server starts, open your browser and navigate to: [http://localhost:5173/](http://localhost:5173/)

*(Alternative methods: You can also run the `dev.bat` script provided in the repository.)*

### Production Build
To create a production-ready optimized build:
```bash
npm run build
```
*(Alternative method: `build.bat`)*

To preview the production build locally:
```bash
npm run preview
```
*(Alternative method: `preview.bat`)*

## 4. Project Flow & Architecture

The application is a Role-Based Dashboard System built with React and Vite. Depending on the user's role and access level, they will interact with different dashboard views.

### Dashboard Routes (The Flow)
The project is structured into 5 distinct hierarchical dashboards. The flow generally moves from granular individual data up to university-wide aggregated data:

1. **Staff Dashboard** (`/staff`)
   - **Target User:** Individual Faculty Members.
   - **Purpose:** Tracks individual R&D performance, ongoing projects, publications, and personal targets.

2. **HoD Dashboard** (`/department`)
   - **Target User:** Head of Department (HoD).
   - **Purpose:** Aggregates data for a specific department. Allows the HoD to monitor the collective performance of all staff members within that department.

3. **Faculty Dean Dashboard** (`/faculty-dean`)
   - **Target User:** Faculty Dean.
   - **Purpose:** Aggregates data across multiple departments that make up a specific Faculty/School.

4. **Executive Dean Dashboard** (`/executive-dean`)
   - **Target User:** Executive Dean.
   - **Purpose:** Provides a broader overview of research activities across major divisions.

5. **University Dean Dashboard** (`/university`)
   - **Target User:** University Dean / Top-level Administration.
   - **Purpose:** The highest level of aggregation. Provides a comprehensive, university-wide view of all research and development metrics, publications, and grants. The dashboard includes interactive charts (using Plotly/Recharts) and an AI Chatbot for querying university-wide data.

## 5. Key Technologies Used
- **Core Framework:** React 19 + Vite
- **Routing:** React Router DOM
- **UI & Styling:** Tailwind CSS 3
- **Data Visualization (Charts):** Recharts, Plotly.js (`react-plotly.js`)
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Data Processing:** xlsx (for Excel data integration)
- **AI Integration:** Includes an AI Chatbot widget integrated into the University Dean Dashboard.

## 6. Project Structure

Here is a tree representation of the `src` directory containing the primary source code and assets:

```text
src/
├── App.css
├── App.jsx
├── index.css
├── main.jsx
├── assets/
│   ├── logo.png
│   ├── Riafacultyimport.py
│   ├── Riapublicationsimport.py
│   ├── riapubv2.py
│   ├── RIA_Faculty.xlsx
│   └── RIA_Publications.xlsx
├── auth/
│   ├── AuthContext.jsx
│   └── ProtectedRoute.jsx
├── components/
│   ├── AIChatbot.jsx
│   ├── AIInsightsPanel.jsx
│   ├── AlertNotificationCenter.jsx
│   ├── BreadcrumbNavigation.jsx
│   ├── CategoryScoreBand.jsx
│   ├── DataTable.jsx
│   ├── DonutChart.jsx
│   ├── FacultyScoreCard.jsx
│   ├── FundedProjectsPanel.jsx
│   ├── HorizontalBarChart.jsx
│   ├── KPICard.jsx
│   ├── Layout.jsx
│   ├── MultiLineChart.jsx
│   ├── NestedDonutChart.jsx
│   ├── ParameterScoreTable.jsx
│   ├── PhDTrackingPanel.jsx
│   ├── PublicationDetailView.jsx
│   ├── PublicationListView.jsx
│   ├── RadarChart.jsx
│   ├── ScatterPlot.jsx
│   ├── SemiCircleGauge.jsx
│   ├── Sidebar.jsx
│   ├── SimpleBarChart.jsx
│   ├── StackedBarChart.jsx
│   ├── StatGauge.jsx
│   ├── TargetProgressCard.jsx
│   └── Topbar.jsx
├── data/
│   ├── excelDataLoader.js
│   └── mockData.js
└── pages/
    ├── ExecutiveDeanDashboard.jsx
    ├── FacultyDeanDashboard.jsx
    ├── HodDashboard.jsx
    ├── LoginPage.jsx
    ├── StaffDashboard.jsx
    ├── UniversityDeanDashboard.jsx
    └── department/
        ├── deptConstants.js
        ├── DeptFacultyData.jsx
        ├── DeptFacultyList.jsx
        ├── DeptLayout.jsx
        ├── DeptOverview.jsx
        ├── DeptResearchOutcomes.jsx
        └── DeptScores.jsx
```

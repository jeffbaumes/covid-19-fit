import * as d3 from "https://cdn.skypack.dev/d3@5?dts";
import * as Plot from "https://cdn.skypack.dev/@observablehq/plot@0.3?dts";
import { replaceChild, range, select, date } from "./inputs.ts";

function initializeControls({ states } : { states: string[] }, interactive: Record<string, any>) {
  const controls = document.getElementById("controls");

  if (!controls) {
    throw new Error("Could not find control element");
  }

  function updateInteractive(name: string) {
    return (value: string) => {
      if (!interactive) {
        return;
      }
      interactive[name] = typeof interactive[name] === 'number' ? +value : value;
      data.then((data) => {
        if (!interactive) {
          return;
        }
        createChart(data, interactive);
      });
    };
  }

  select(controls, {
    description: "Region",
    value: interactive.state,
    options: ["United States", ...states],
    update: updateInteractive("state"),
  });
  date(controls, {
    description: "Start date",
    value: interactive.startDate,
    update: updateInteractive("startDate"),
  });
  range(controls, {
    description: "Moving average days",
    min: 1,
    max: 30,
    value: interactive.smoothingDays,
    update: updateInteractive("smoothingDays"),
  });
  range(controls, {
    description: "Case to hospital days",
    max: 30,
    value: interactive.hospitalizationDays,
    update: updateInteractive("hospitalizationDays"),
  });
  range(controls, {
    description: "Case to death days",
    max: 30,
    value: interactive.days,
    update: updateInteractive("days"),
  });
  range(controls, {
    description: "Mortality",
    max: 5.0,
    step: 0.01,
    value: interactive.mortality,
    update: updateInteractive("mortality"),
  });
  range(controls, {
    description: "Missed case multiplier",
    min: 1.0,
    max: 10.0,
    step: 0.1,
    value: interactive.missedCaseMultiplier,
    update: updateInteractive("missedCaseMultiplier"),
  });
  range(controls, {
    description: "Hospitalization factor",
    min: 1.0,
    max: 10.0,
    step: 0.1,
    value: interactive.hospitalizationFactor,
    update: updateInteractive("hospitalizationFactor"),
  });
}

async function getData() {
  let stateAbbreviationMap = await (await fetch('stateAbbreviationMap.json')).json();

  let rawStateData = await (async () => {
    const rawData = await d3.csv('https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv', (d: any) => {
      d.rawDate = d.date;
      d.date = d3.timeParse("%Y-%m-%d")(d.date);
      d.cumulativeCases = +d.cases;
      d.cumulativeDeaths = +d.deaths;
      return d;
    });
    return rawData;
  })();

  let rawVaxData = await (async () => {
    const data = await d3.csv('https://raw.githubusercontent.com/govex/COVID-19/master/data_tables/vaccine_data/us_data/time_series/vaccine_data_us_timeline.csv', (d: any) => {
      d.rawDate = d.Date;
      d.date = d3.timeParse("%Y-%m-%d")(d.Date);
      d.state = d.Province_State;
      d.cumulativeDoses = +d.Doses_admin;
      d.cumulativeStageOne = +d.Stage_One_Doses;
      d.cumulativeStageTwo = +d.Stage_Two_Doses;
      return d;
    });
    return data.filter((d: any) => d.Vaccine_Type === 'All');
  })();

  // let rawHospitalizationData: any[] = [];
  let rawHospitalizationData: any[] = await (async () => {
    const rawData = (await d3.json('https://healthdata.gov/resource/g62h-syeh.json?$limit=50000') as any).map((d: any) => {
      d.rawDate = d.date.substring(0, 10);
      d.date = new Date(d.date);
      d.state = stateAbbreviationMap[d.state];
      d.hospitalizations = +d.inpatient_beds_used_covid;
      return d;
    });
    return rawData;
  })();

  let usData = await (async () => {
    const data = await d3.csv('https://raw.githubusercontent.com/nytimes/covid-19-data/master/us.csv', (d: any) => {
      d.rawDate = d.date;
      d.date = d3.timeParse("%Y-%m-%d")(d.date);
      d.cumulativeCases = +d.cases;
      d.cumulativeDeaths = +d.deaths;
      d.cumulativeStageOne = 0;
      d.cumulativeStageTwo = 0;
      return d;
    });

    const map = {} as Record<string, any>;
    data.forEach((d: { rawDate: string|number; }, i: any) => {
      map[d.rawDate] = i;
    });

    rawVaxData.forEach((d: { rawDate: string|number; cumulativeStageTwo: any; cumulativeStageOne: any; }) => {
      if (data[map[d.rawDate]] && d.cumulativeStageTwo) {
        data[map[d.rawDate]].cumulativeStageTwo += d.cumulativeStageTwo;
      }
      if (data[map[d.rawDate]] && d.cumulativeStageOne) {
        data[map[d.rawDate]].cumulativeStageOne += d.cumulativeStageOne;
      }
    });

    rawHospitalizationData.forEach(d => {
      if (data[map[d.rawDate]] && d.hospitalizations) {
        if (!data[map[d.rawDate]].hospitalizations) {
          data[map[d.rawDate]].hospitalizations = 0;
        }
        data[map[d.rawDate]].hospitalizations += d.hospitalizations;
      }
    });

    return data;
  })();

  let rawPopData = await (await fetch('rawPopData.json')).json();

  let states = rawStateData.map((d: { state: any; }) => d.state).filter((v: any, i: any, a: any[]) => a.indexOf(v) === i).sort();

  return {
    rawStateData,
    rawVaxData,
    rawHospitalizationData,
    usData,
    rawPopData,
    states,
  };
};

function createChart({
    rawStateData,
    rawVaxData,
    rawHospitalizationData,
    usData,
    rawPopData,
    states,
  } : Record<string, any>, {
    smoothingDays,
    days,
    hospitalizationDays,
    hospitalizationFactor,
    missedCaseMultiplier,
    mortality,
    state,
    startDate,
    width,
  } : Record<string, any> ) {

  let height = width * 0.25;

  let dateMap = (() => {
    const map = {} as Record<string, any>;
    usData.forEach((d: any, i: number) => {
      map[d.rawDate] = i;
    });
    return map;
  })()

  let stateData = (state: any) => {
    const stateData = usData.map((d: any) => ({
      date: d.date,
      rawDate: d.rawDate,
      cumulativeCases: 0,
      cumulativeDeaths: 0,
      cumulativeDoses: 0,
    }));
    rawStateData.forEach((d: any) => {
      if (d.state === state) {
        stateData[dateMap[d.rawDate]].cumulativeCases = d.cumulativeCases;
        stateData[dateMap[d.rawDate]].cumulativeDeaths = d.cumulativeDeaths;
      }
    });
    rawVaxData.forEach((d: any) => {
      if (d.state === state && stateData[dateMap[d.rawDate]]) {
        stateData[dateMap[d.rawDate]].cumulativeStageOne = d.cumulativeStageOne;
      }
    });
    rawHospitalizationData.forEach((d: any) => {
      if (d.state === state && stateData[dateMap[d.rawDate]]) {
        stateData[dateMap[d.rawDate]].hospitalizations = d.hospitalizations;
      }
    });
    return stateData;
  };

  let scaledData = (state: string) => {
    const data = state === 'United States' ? usData : stateData(state);
    data.forEach((d: any, i: number) => {
      if (i == 0) {
        d.dailyCases = data[i].cumulativeCases;
        d.dailyDeaths = data[i].cumulativeDeaths;
        d.dailyVaccines = 0;
      } else {
        d.dailyCases = data[i].cumulativeCases - data[i-1].cumulativeCases;
        d.dailyDeaths = data[i].cumulativeDeaths - data[i-1].cumulativeDeaths;
        d.dailyVaccines = data[i].cumulativeStageOne - data[i-1].cumulativeStageOne;
      }
    });
    const at = (n: number, field: string) => (n >= 0 && n < data.length) ? data[n][field] : NaN;
    data.forEach((d: any, i: number) => {
      d.cases = (at(i, 'cumulativeCases') - at(i - smoothingDays, 'cumulativeCases'))/smoothingDays;
      d.deaths = (at(i, 'cumulativeDeaths') - at(i - smoothingDays, 'cumulativeDeaths'))/smoothingDays;
      d.vaccines = (at(i, 'cumulativeStageOne') - at(i - smoothingDays, 'cumulativeStageOne'))/smoothingDays;
      d.vaccinesPer100k = 100000 * d.vaccines / popMap[state];
      d.hospital = 0;
      for (let j = 0; j < smoothingDays; j += 1) {
        d.hospital += at(i - j, 'hospitalizations');
      }
      d.hospital /= smoothingDays;
    });
    data.forEach((d: any, i: number) => {
      d.cases = d.cases * missedCaseMultiplier;
      d.casesPer100k = 100000 * d.cases / popMap[state];
      d.deaths = at(i + days, 'deaths');
      d.deathsPer100k = 100000 * d.deaths / popMap[state];
      d.hospital = at(i + hospitalizationDays, 'hospital');
      d.hospitalPer100k = 100000 * d.hospital / popMap[state];
      d.deathsPer100kScaled = d.deathsPer100k * 100 / mortality;
      d.hospitalPer100kScaled = d.hospitalPer100k * hospitalizationFactor;
    });
    data.forEach((d: any) => {
      d.percentVaccinated = 100 * d.cumulativeStageOne / popMap[state];
      d.percentInfected = 100 * d.cumulativeCases * missedCaseMultiplier / popMap[state];
      d.percentDeaths = 100 * d.cumulativeDeaths / popMap[state];
      d.percentImmune = d.percentVaccinated + d.percentInfected - 100 * (d.percentVaccinated / 100) * (d.percentInfected / 100);
    });
    return data;
  };

  let popMap = (() => {
    const filtered = rawPopData.filter((d: { Year: string|number; }) => +d.Year === 2019);
    const map = {} as Record<string, any>;
    let totalPop = 0;
    filtered.forEach((d: Record<string, any>) => {
      map[d.State] = d['Total Population'];
      totalPop += d['Total Population'];
    });
    map['United States'] = totalPop;
    return map;
  })() as Record<string, any>;

  let dataMap = (() => {
    const map = {} as Record<string, any>;
    ['United States', ...states].forEach(d => {
      map[d] = scaledData(d);
    });
    return map;
  })();


  let data = dataMap[state];

  let colorVaccinated = '#4f8b7d'
  let colorDeaths = "#999"
  let colorHospitalizations = "#99f"
  let colorVaccines = '#00f5'
  let colorCases = "#e88"

  const startTime = new Date(startDate).getTime();
  data = data.filter((d: any) => d.date.getTime() >= startTime);

  replaceChild("cases-chart", Plot.plot({
    width,
    height,
    marks: [
      Plot.ruleY([0]),
      Plot.line(data, {x: "date", y: "deathsPer100kScaled", stroke: colorDeaths}),
      Plot.line(data, {x: "date", y: "casesPer100k", stroke: colorCases}),
      Plot.line(data, {x: "date", y: "hospitalPer100kScaled", stroke: colorHospitalizations}),
    ],
  }));

  replaceChild("deaths-chart", Plot.plot({
    width, height,
    marks: [
      Plot.ruleY([0]),
      Plot.line(data, {x: "date", y: "deathsPer100k", stroke: colorDeaths}),
    ],
  }));

  replaceChild("hospital-chart", Plot.plot({
    width, height,
    marks: [
      Plot.ruleY([0]),
      Plot.line(data, {x: "date", y: "hospitalPer100k", stroke: colorHospitalizations}),
    ],
  }));

  replaceChild("vaccinated-chart", Plot.plot({
    width, height,
    y: {domain: [0, 100]},
    marks: [
      Plot.ruleY([0]),
      Plot.line(data, {x: "date", y: "percentVaccinated", stroke: colorVaccinated}),
    ],
  }));

  replaceChild("vaccinations-chart", Plot.plot({
    width, height,
    marks: [
      Plot.ruleY([0]),
      Plot.line(data, {x: "date", y: "vaccinesPer100k", stroke: colorVaccines}),
    ],
  }));
}

let data = getData();
data.then((data) => {
  const interactive = {
    smoothingDays: 7,
    days: 18,
    hospitalizationDays: 9,
    mortality: 0.5,
    startDate: "2020-01-01",
    state: "United States",
    missedCaseMultiplier: 3,
    hospitalizationFactor: 5,
    width: document.getElementById("cases-chart")?.clientWidth,
  };
  initializeControls(data, interactive);
  window.addEventListener("resize", () => {
    interactive.width = document.getElementById("cases-chart")?.clientWidth;
    createChart(data, interactive);
  });
  createChart(data, interactive);
});

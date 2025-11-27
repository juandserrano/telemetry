// WebSocket Connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}`;
const ws = new WebSocket(wsUrl);

const connectionStatus = document.getElementById('connectionStatus');
const dataList = document.getElementById('dataList');

// Data Storage
const maxDataPoints = 50;
let telemetryData = [];

// Metrics Configuration
const metrics = {
  cpu: { id: 'cpu', label: 'CPU', color: 'var(--color-cpu)', getValue: d => d.cpu_usage, enabled: true, chartId: 'chart-percent', unit: '%' },
  ram: { id: 'ram', label: 'RAM', color: 'var(--color-ram)', getValue: d => d.ram_usage, enabled: true, chartId: 'chart-percent', unit: '%' },
  power: { id: 'power', label: 'Power', color: 'var(--color-power)', getValue: d => d.power_usage, enabled: true, chartId: 'chart-power', unit: 'W' },
  temp: { id: 'temp', label: 'Temp', color: 'var(--color-temp)', getValue: d => d.temperature, enabled: true, chartId: 'chart-temp', unit: '°C' }
};

// Toggle Event Listeners
document.getElementById('cpuToggle').addEventListener('change', e => toggleMetric('cpu', e.target.checked));
document.getElementById('ramToggle').addEventListener('change', e => toggleMetric('ram', e.target.checked));
document.getElementById('powerToggle').addEventListener('change', e => toggleMetric('power', e.target.checked));
document.getElementById('tempToggle').addEventListener('change', e => toggleMetric('temp', e.target.checked));

function toggleMetric(id, enabled) {
  metrics[id].enabled = enabled;
  updateAllCharts();
}

// Tooltip Element
const tooltip = d3.select("body").append("div")
  .attr("class", "tooltip")
  .style("opacity", 0);

// Chart Class to handle multiple instances
class TelemetryChart {
  constructor(containerId, yDomain) {
    this.containerId = containerId;
    this.yDomain = yDomain;
    this.margin = { top: 20, right: 30, bottom: 30, left: 40 };
    this.container = document.getElementById(containerId);
    this.width = this.container.clientWidth - this.margin.left - this.margin.right;
    this.height = this.container.clientHeight - this.margin.top - this.margin.bottom;

    this.init();
  }

  init() {
    this.svg = d3.select(`#${this.containerId}`)
      .append('svg')
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Clip Path
    this.svg.append("defs").append("clipPath")
      .attr("id", `clip-${this.containerId}`)
      .append("rect")
      .attr("width", this.width)
      .attr("height", this.height);

    this.chartBody = this.svg.append("g")
      .attr("clip-path", `url(#clip-${this.containerId})`);

    // Scales
    this.x = d3.scaleTime().range([0, this.width]);
    this.y = d3.scaleLinear().range([this.height, 0]).domain(this.yDomain);

    // Axes
    this.xAxis = this.svg.append('g')
      .attr('transform', `translate(0,${this.height})`)
      .attr('class', 'axis');

    this.yAxis = this.svg.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(this.y));

    this.yGrid = this.svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(this.y).tickSize(-this.width).tickFormat(''));

    // Line Generator
    this.lineGenerator = d3.line()
      .x(d => this.x(d.timestamp))
      .curve(d3.curveMonotoneX);

    // Zoom
    this.zoom = d3.zoom()
      .scaleExtent([1, 10])
      .translateExtent([[0, 0], [this.width, this.height]])
      .extent([[0, 0], [this.width, this.height]])
      .on("zoom", (event) => this.zoomed(event));

    // Overlay for mouse events
    this.overlay = this.svg.append("rect")
      .attr("width", this.width)
      .attr("height", this.height)
      .style("fill", "none")
      .style("pointer-events", "all")
      .call(this.zoom)
      .on("mousemove", (event) => this.mousemove(event))
      .on("mouseover", () => this.mouseover())
      .on("mouseout", () => this.mouseout());

    this.currentTransform = d3.zoomIdentity;
    this.bisect = d3.bisector(d => d.timestamp).left;
  }

  zoomed(event) {
    this.currentTransform = event.transform;
    this.update();
  }

  mousemove(event) {
    if (telemetryData.length === 0) return;

    const [mouseX] = d3.pointer(event);
    const newX = this.currentTransform.rescaleX(this.x);
    const x0 = newX.invert(mouseX);
    const i = this.bisect(telemetryData, x0, 1);
    const d0 = telemetryData[i - 1];
    const d1 = telemetryData[i];

    let d = d0;
    if (d1 && d0) {
      d = x0 - d0.timestamp > d1.timestamp - x0 ? d1 : d0;
    } else if (!d0 && d1) {
      d = d1;
    }

    if (!d) return;

    // Update focus dots and tooltip
    let tooltipContent = `<div class="time">${d.timestamp.toLocaleTimeString()}</div>`;
    let hasVisibleMetrics = false;

    Object.values(metrics).forEach(metric => {
      if (metric.chartId !== this.containerId || !metric.enabled) return;

      hasVisibleMetrics = true;
      const focus = this.chartBody.select(`.focus-dot.${metric.id}`);

      if (focus.empty()) {
        this.chartBody.append("circle")
          .attr("class", `focus-dot ${metric.id}`)
          .attr("r", 5)
          .style("fill", metric.color)
          .style("stroke", "var(--bg-color)")
          .style("stroke-width", "2px")
          .style("pointer-events", "none");
      }

      this.chartBody.select(`.focus-dot.${metric.id}`)
        .attr("cx", newX(d.timestamp))
        .attr("cy", this.y(metric.getValue(d)))
        .style("opacity", 1);

      tooltipContent += `
                <div class="value" style="color: ${metric.color}">
                    ${metric.label}: ${metric.getValue(d).toFixed(1)}${metric.unit}
                </div>
            `;
    });

    if (hasVisibleMetrics) {
      tooltip.transition().duration(100).style("opacity", 1);
      tooltip.html(tooltipContent)
        .style("left", (event.pageX + 15) + "px")
        .style("top", (event.pageY - 28) + "px");
    } else {
      tooltip.style("opacity", 0);
    }
  }

  mouseover() {
    // Dots are handled in mousemove
  }

  mouseout() {
    tooltip.transition().duration(200).style("opacity", 0);
    this.chartBody.selectAll(".focus-dot").style("opacity", 0);
  }

  update() {
    if (telemetryData.length === 0) return;

    const extent = d3.extent(telemetryData, d => d.timestamp);
    const newX = this.currentTransform.rescaleX(this.x.domain(extent));

    this.xAxis.call(d3.axisBottom(newX).tickFormat(d3.timeFormat("%H:%M:%S")));

    // Draw lines for metrics assigned to this chart
    Object.values(metrics).forEach(metric => {
      if (metric.chartId !== this.containerId) return;

      let path = this.chartBody.select(`.line.${metric.id}`);

      if (path.empty()) {
        path = this.chartBody.append('path')
          .attr('class', `line ${metric.id}`);
      }

      if (metric.enabled) {
        this.lineGenerator.y(d => this.y(metric.getValue(d)));
        this.lineGenerator.x(d => newX(d.timestamp));

        path.datum(telemetryData)
          .attr('d', this.lineGenerator)
          .style('opacity', 1);

        // Add symbols
        const symbols = this.chartBody.selectAll(`.symbol.${metric.id}`)
          .data(telemetryData);

        symbols.enter()
          .append('path')
          .attr('class', `symbol ${metric.id}`)
          .merge(symbols)
          .attr('d', d3.symbol().type(d3.symbolDiamond).size(30))
          .attr('transform', d => `translate(${newX(d.timestamp)},${this.y(metric.getValue(d))})`)
          .style('fill', metric.color)
          .style('opacity', 1);

        symbols.exit().remove();

      } else {
        path.style('opacity', 0);
        this.chartBody.selectAll(`.symbol.${metric.id}`).remove();
        this.chartBody.selectAll(`.focus-dot.${metric.id}`).remove();
      }
    });
  }

  resize() {
    this.width = this.container.clientWidth - this.margin.left - this.margin.right;
    this.height = this.container.clientHeight - this.margin.top - this.margin.bottom; // Recalculate height

    // Update SVG dimensions
    d3.select(`#${this.containerId} svg`)
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom);

    // Update Scales
    this.x.range([0, this.width]);
    this.y.range([this.height, 0]);

    // Update Clip Path
    this.svg.select(`#clip-${this.containerId} rect`)
      .attr("width", this.width)
      .attr("height", this.height);

    // Update Zoom
    this.zoom.translateExtent([[0, 0], [this.width, this.height]])
      .extent([[0, 0], [this.width, this.height]]);

    // Update Overlay
    this.svg.select("rect")
      .attr("width", this.width)
      .attr("height", this.height);

    // Update Axes and Grid
    this.xAxis.attr('transform', `translate(0,${this.height})`);
    this.yAxis.call(d3.axisLeft(this.y));
    this.yGrid.call(d3.axisLeft(this.y).tickSize(-this.width).tickFormat(''));

    this.update();
  }
}

// Initialize Charts
const charts = {
  percent: new TelemetryChart('chart-percent', [0, 100]),
  power: new TelemetryChart('chart-power', [0, 500]),
  temp: new TelemetryChart('chart-temp', [0, 100])
};

function updateAllCharts() {
  Object.values(charts).forEach(chart => {
    chart.update();

    // Check if any metric for this chart is enabled
    const hasEnabledMetrics = Object.values(metrics).some(m => m.chartId === chart.containerId && m.enabled);

    // Toggle container visibility
    // The chart is inside a .chart-wrapper div, which is the parent of the container
    const wrapper = document.getElementById(chart.containerId).parentElement;
    if (hasEnabledMetrics) {
      wrapper.style.display = 'block';
    } else {
      wrapper.style.display = 'none';
    }
  });
}

// Drag and Drop Logic
const draggables = document.querySelectorAll('.control-group');
const controlsContainer = document.getElementById('metricControls');
const chartsContainer = document.querySelector('.charts-container');

draggables.forEach(draggable => {
  draggable.addEventListener('dragstart', () => {
    draggable.classList.add('dragging');
  });

  draggable.addEventListener('dragend', () => {
    draggable.classList.remove('dragging');
    reorderCharts();
  });
});

controlsContainer.addEventListener('dragover', e => {
  e.preventDefault();
  const afterElement = getDragAfterElement(controlsContainer, e.clientX);
  const draggable = document.querySelector('.dragging');
  if (afterElement == null) {
    controlsContainer.appendChild(draggable);
  } else {
    controlsContainer.insertBefore(draggable, afterElement);
  }
});

function getDragAfterElement(container, x) {
  const draggableElements = [...container.querySelectorAll('.control-group:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function reorderCharts() {
  const currentOrder = [...controlsContainer.querySelectorAll('.control-group')].map(el => el.dataset.chart);

  currentOrder.forEach(chartId => {
    const chartWrapper = document.getElementById(chartId).parentElement;
    chartsContainer.appendChild(chartWrapper);
  });
}

// WebSocket Event Handlers
ws.onopen = () => {
  console.log('Connected to WebSocket server');
  connectionStatus.classList.add('connected');
  connectionStatus.querySelector('.text').textContent = 'Connected';
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket server');
  connectionStatus.classList.remove('connected');
  connectionStatus.querySelector('.text').textContent = 'Disconnected';
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  data.timestamp = new Date(data.timestamp);

  updateData(data);
  updateAllCharts();
  updateList(data);
};

function updateData(newData) {
  telemetryData.push(newData);
  if (telemetryData.length > maxDataPoints) {
    telemetryData.shift();
  }
}

function updateList(data) {
  const li = document.createElement('li');
  li.innerHTML = `
        <span class="time">${data.timestamp.toLocaleTimeString()}</span>
        <div class="metrics">
            <div class="metric"><span style="color:var(--color-cpu)">CPU:</span> <span>${data.cpu_usage.toFixed(1)}%</span></div>
            <div class="metric"><span style="color:var(--color-ram)">RAM:</span> <span>${data.ram_usage.toFixed(1)}%</span></div>
            <div class="metric"><span style="color:var(--color-power)">PWR:</span> <span>${data.power_usage.toFixed(0)}W</span></div>
            <div class="metric"><span style="color:var(--color-temp)">TMP:</span> <span>${data.temperature.toFixed(1)}°C</span></div>
        </div>
    `;

  dataList.prepend(li);

  if (dataList.children.length > 10) {
    dataList.removeChild(dataList.lastChild);
  }
}

// Handle Window Resize
window.addEventListener('resize', () => {
  Object.values(charts).forEach(chart => chart.resize());
});

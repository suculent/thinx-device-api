var Dashboard = function() {

  var dashboardMainChart = null;

  return {

    initMorisCharts: function(data) {
      if (Morris.EventEmitter && $('#device_statistics').size() > 0) {
        // Use Morris.Area instead of Morris.Line
        dashboardMainChart = Morris.Area({
          element: 'device_statistics',
          padding: 30,
          behaveLikeLine: true,
          gridEnabled: true,
          gridLineColor: '#BBBBBB',
          axes: true,
          fillOpacity: .7,
          data: data,
          lineColors: ['#399a8c', '#EF4836'],
          xkey: 'date',
          ykeys: ['checkins', 'errors'],
          labels: ['Checkins', 'Errors'],
          pointSize: 0,
          lineWidth: 0,
          hideHover: 'auto',
          resize: true,
          smooth: false
        });

      }
    },

    updateMorisCharts: function(dashboardMainChart, data) {
      console.log('================== updating charts ==================');
      console.log(dashboardMainChart);
      dashboardMainChart.setData(data);
    },

    init: function(data) {
      // if (dashboardMainChart == null) {
        console.log('================== initilizing charts ==================');
        $('#device_statistics').empty();
        this.initMorisCharts(data);
    }
  };

}();

if (App.isAngularJsApp() === false) {
  jQuery(document).ready(function() {
    Dashboard.init(); 
  });
}

module.exports = {  
    apps: [  
      {  
        name: "taptolink",  
        script: "index.js",  
        watch: true,                // Включает отслеживание изменений (как nodemon)  
        ignore_watch: ["cookies.json"], // Игнорирует изменения в cookies.json  
        env: {  
          NODE_ENV: "production"    // Устанавливает переменную окружения  
        }  
      }  
    ]  
  };  
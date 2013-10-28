/* global require,$*/
~function(window){

	'use strict';

	var path = require('path');

	// 用于与Grunt通讯的对象，负责读取及调用Grunt
	var gruntBridge = {
		basePath:'.',
		config:{}
	};

	var pluginList = {

		watch:{
			name:'grunt-contrib-watch',
			version:'~0.5.3'
		},
		connect:{
			name:'grunt-contrib-connect',
			version: '~0.5.0'
		},
		open:{
			name:'grunt-open',
			version: '~0.2.2'
		}

	};

	// 辅助方法
	var helper = {
		// 用于grunt对象
		readJSON:function(filePath){
			// return require('./'+path.join(gruntBridge.basePath,filePath));
			return require(path.join(gruntBridge.basePath,gruntBridge.gruntfilePath,filePath));
		},
		// 解析标准输出
		parseOutput:function(output,jobProgress){
			
			
			output = output + '';
			// 过滤控制颜色的标识，类似[4m、[32m
			output = output.replace(/\[\d{1,2}m/g,'');

			var newJobPattern = /Running "(.*)" \((\w+)\) task/m;
			var newJobMatch = output.match(newJobPattern);
			// console.dir(newJobMatch);

			if(newJobMatch && newJobMatch.length && newJobMatch.length >= 3){
				// 进入新Job

				// 先将之前的Job全部置为完成
				jobProgress.forEach(function(jobItem){
					jobItem.status = 'done';
					jobItem.progress = 100;
				});

				// 然后push新Job
				jobProgress.push({
					name:newJobMatch[1],
					status:'doing',
					progress:10
				});

			}else{
				// 没有匹配到新的Job，更新之前的进度
				var targetJobArr = jobProgress.filter(function(jobItem){
					return jobItem.status === 'doing';
				});

				if(targetJobArr && targetJobArr.length){
					targetJobArr[0].progress += 10;
					if(targetJobArr[0].progress >= 90){
						targetJobArr[0].progress = 90;
					}
				}

			}

			// return jobProgress;

		},
		// 解析进程退出代码
		parseExit:function(code,jobProgress){
			switch(code){

				// 正常退出
				case 0:
					jobProgress.forEach(function(jobItem){
						jobItem.status = 'done';
						jobItem.progress = '100';
					});
					break;
				// 报错
				case 3:
					jobProgress.forEach(function(jobItem){

						if(jobItem.status === 'doing'){
							jobItem.status = 'error';
						}

					});
					break;
			}
		},
		// 设置最近打开项目
		setRecentProjects:function(projectName,basePath,gruntfilePath){
			var recentProjects = JSON.parse(localStorage.getItem('recentProjects') || '[]');
			var targetProject = recentProjects.filter(function(project){

				return project.name === projectName;

			});

			if(targetProject.length){

				targetProject.basePath = basePath;
				targetProject.gruntfilePath = gruntfilePath;

			}else{

				recentProjects.push({
					name:projectName,
					basePath:basePath,
					gruntfilePath:gruntfilePath
				});
			}

			localStorage.setItem('recentProjects',JSON.stringify(recentProjects));

		}
	};

	// 包装的伪grunt对象，用于读取Gruntfile配置
	var grunt = {
		initConfig:readJobs,
		loadNpmTasks:readPlugins,
		registerTask:readTasks,
		file:{
			readJSON:helper.readJSON
		}
	};

	gruntBridge.initConfig = function(projectPath,gruntfilePath,shouldGetConfig){

		gruntBridge.basePath = projectPath;
		if(gruntfilePath){
			gruntBridge.gruntfilePath = gruntfilePath;
		}else{
			gruntBridge.gruntfilePath = '.';
		}
		if(typeof shouldGetConfig === 'undefined' || shouldGetConfig){
			gruntBridge.getConfig();
			helper.setRecentProjects(gruntBridge.config.package.name,gruntBridge.basePath,gruntBridge.gruntfilePath);
		}

	};

	// 读取Gruntfile
	gruntBridge.getConfig = function(gruntFileName,packageName){
		if(!gruntFileName){
			gruntFileName = path.join(this.basePath,this.gruntfilePath,'Gruntfile.js');
		}
		if(!packageName){
			packageName = 'package.json';
		}
		var gruntFunc = require(gruntFileName);
		gruntFunc(grunt);

		gruntBridge.config.package = helper.readJSON(packageName);
	};

	// 运行Grunt的指定任务
	gruntBridge.doCompile = function(taskName){

		// 用于编译过程中标记各个Job的进度
		var jobProgress = [];
		$(window).trigger('gruntBridge.jobStart');

		var spawn = require('child_process').spawn,
			grunt;

		// grunt = spawn('which',['node','grunt']);
		grunt = spawn('/usr/local/bin/node',['/usr/local/bin/grunt',taskName],{
			cwd:path.join(gruntBridge.basePath,gruntBridge.gruntfilePath)
		});

		// 捕获标准输出
		grunt.stdout.on('data', function(output){
			console.log(output+'');
			helper.parseOutput(output,jobProgress);
			$(window).trigger('gruntBridge.jobProgress',[jobProgress]);
		});

		// 捕获标准错误输出并将其打印到控制台
		grunt.stderr.on('data', function (data) {
			console.log('标准错误输出：\n' + data);
			$(window).trigger('gruntBridge.error',[data]);
		});

		// 注册子进程关闭事件
		grunt.on('exit', function (code, signal) {
			helper.parseExit(code,jobProgress);
			$(window).trigger('gruntBridge.jobProgress',[jobProgress]);
			$(window).trigger('gruntBridge.exit');
		});

		gruntBridge._gruntProcess = grunt;

	};


	// 安装依赖
	gruntBridge.initNpm = function(success,fail){

		var proxyStr = require('nw.gui').App.getProxyForURL('https://registry.npmjs.org/');
		var proxyRegExp = /^PROXY (.*)$/;

		var spawn = require('child_process').spawn;
		var proxyCommand = 'proxy=';

		if(proxyStr === 'DIRECT'){
			proxyCommand += 'null';
		}else{
			var proxyMatch = proxyStr.match(proxyRegExp);
			var proxyUrl;

			if(proxyMatch && proxyMatch.length && proxyMatch.length >= 2){
				proxyUrl = 'http://' + proxyMatch[1];
			}else{
				proxyUrl = 'null';
			}
			proxyCommand += proxyUrl;
		}
		
		var proxy = spawn('/usr/local/bin/node',['/usr/local/bin/npm','set',proxyCommand],{
			cwd:path.join(gruntBridge.basePath,gruntBridge.gruntfilePath)
		});

		proxy.on('exit',function(){
			initNpm(success,fail);
		});


		function initNpm(success,fail){

			var log = '';

			var npm = spawn('/usr/local/bin/node',['/usr/local/bin/npm','install'],{
				cwd:path.join(gruntBridge.basePath,gruntBridge.gruntfilePath)
			});

			// 捕获标准输出
			npm.stdout.on('data', function(output){
				console.log(output+'');
			});

			// 捕获标准错误输出并将其打印到控制台
			npm.stderr.on('data', function (data) {
				console.log('标准错误输出：\n' + data);
				log += data;
			});

			// 注册子进程关闭事件
			npm.on('exit', function (code, signal) {
				if(code === 0){
					success(log);
				}else{
					fail(log);
				}
			});
				
		}

	};

	// 写package.json
	gruntBridge.writePackageJson = function(dependencies){

		var fs = require('fs');

		var packageObj = {
			name:'kapok_project_' + Date.now(),
			version:'0.0.1',
			devDependencies:{
				grunt:"~0.4.0"
			}
		};

		if(dependencies && dependencies.length){
			dependencies.forEach(function(plugin){

				var tmpObj = {};
				tmpObj[pluginList[plugin].name] = pluginList[plugin].version;

				$.extend(packageObj.devDependencies,tmpObj);

			});
		}

		fs.mkdir(path.join(gruntBridge.basePath,'.kapok'),function(){
			fs.writeFile(path.join(gruntBridge.basePath,'.kapok/package.json'),JSON.stringify(packageObj,null,'\t'),function(){});
		});

	};

	// 写Gruntfile.js
	gruntBridge.writeGruntFile = function(taskList){

		var fs = require('fs');

		var preText = 'module.exports = function(grunt){\n' +
				   '\tgrunt.initConfig(';
		var afterTaskText = ');\n\n';
		var gruntFileContent = '';
		var tasks = {};
		var taskRegistration = [];
		var taskRegistrationText = '';
		var taskComponents = {};
		var taskComponentsText = '';

		for(var taskName in taskList){
			if(taskList.hasOwnProperty(taskName)){
				var taskContent = taskList[taskName];
				if(!taskComponents[taskName]){
					taskComponents[taskName] = [];
				}
				for(var jobName in taskContent){
					if(taskContent.hasOwnProperty(jobName)){
						var jobContent = taskContent[jobName];
						taskComponents[taskName].push(jobName + ':' + taskName);
						taskRegistration.push(pluginList[jobName].name);

						if(!tasks[jobName]){
							tasks[jobName] = {};
						}
						tasks[jobName][taskName] = jobContent;
					}
				}
			}
		}

		// console.log(tasks,taskRegistration,taskComponents);


		taskRegistrationText = taskRegistration.map(function(task){
			return '\tgrunt.loadNpmTasks("' + task + '");\n';
		}).join('');

		for(var taskName in taskComponents){
			if(taskComponents.hasOwnProperty(taskName)){
				taskComponentsText += '\tgrunt.registerTask("' + taskName +
					'",' + JSON.stringify(taskComponents[taskName]) + ');\n';
			}
		}


		gruntFileContent = preText +
				JSON.stringify(tasks,null,'\t').replace(/\n/g,'\n\t') +
				afterTaskText +
				taskRegistrationText +
				taskComponentsText +
				'};';

		// console.log(gruntFileContent);return;

		fs.mkdir(path.join(gruntBridge.basePath,'.kapok'),function(){
			fs.writeFile(path.join(gruntBridge.basePath,'.kapok/Gruntfile.js'),gruntFileContent,function(){});
		});

	};

	function readJobs(jobObj){

		gruntBridge.config.jobs = jobObj;
		console.log(jobObj);

	};

	function readPlugins(pluginTaskName){

		gruntBridge.config.pluginTaskList = gruntBridge.config.pluginTaskList || [];
		gruntBridge.config.pluginTaskList.push(pluginTaskName);

	};

	function readTasks(taskName,taskJobList){
		gruntBridge.config.buildTaskList = gruntBridge.config.buildTaskList || [];
		gruntBridge.config.buildTaskList.push({
			name:taskName,
			jobList:taskJobList
		});
	};

	window.gruntBridge = gruntBridge;

}(window);
const express = require('express');
const PowerSchoolAPI = require("./api/main");
const util = require('util');
const app = express();
const port = 3000;

function inspect(data) {
  return util.inspect(data, { depth: 1 })
}
function jsonify(obj, depth = 1, ignoreKeys = ['client', '_cachedInfo'], showIndexes = true) {
  if (Array.isArray(obj) && !showIndexes) {
    const dict = [];
    for (const item of obj) {
      dict.push(jsonify(item, depth, ignoreKeys, showIndexes));
    }
    return dict;
  } else {
    const dict = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (ignoreKeys.includes(key)) {
          dict[key] = '[Object]';
        } else if (typeof obj[key] === 'object' && depth > 0) {
          dict[key] = jsonify(obj[key], depth - 1, ignoreKeys, showIndexes);
        } else if (typeof obj[key] === 'object') {
          try {
            dict[key] = `[${obj[key].constructor.name}]`;
          } catch (e) {
            dict[key] = '[Object]';
          }
        } else {
          dict[key] = obj[key];
        }
      }
    }
    return dict;
  }
}

function objectify(obj, depth = Infinity, ignoreKeys = ['PowerSchoolAPI'], showIndexes = true) {
  if (Array.isArray(obj) && !showIndexes) {
    const dict = {};
    for (const item of obj) {
      let constructorName;
      try {
        constructorName = item.constructor.name;
      } catch (e) {
        constructorName = 'object';
      }
      if (!dict[constructorName]) {
        dict[constructorName] = [];
      }
      dict[constructorName].push(objectify(item, depth, ignoreKeys, showIndexes));
    }
    return dict;
  } else {
    const dict = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        if (ignoreKeys.includes(key)) {
          continue;
        } else if (typeof obj[key] === 'object' && depth > 0) {
          let constructorName;
          try {
            constructorName = obj[key].constructor.name;
          } catch (e) {
            constructorName = 'object';
          }
          if (!dict[constructorName]) {
            dict[constructorName] = [];
          }
          dict[constructorName].push(objectify(obj[key], depth - 1, ignoreKeys, showIndexes));
        } else if (typeof obj[key] === 'object') {
          let constructorName;
          try {
            constructorName = obj[key].constructor.name;
          } catch (e) {
            constructorName = 'object';
          }
          if (!dict[constructorName]) {
            dict[constructorName] = [];
          }
          dict[constructorName].push('[Object]');
        }
      }
    }
    return dict;
  }
}

app.get('/', (req, res) => {
  res.send(["/api/name", "/api/assignments", "/api/info", "/api/averages", "/api/classes", "/api/reportcard", "/api/ipr", "api/transcript", "api/rank"]);
});

app.get('/api/name', async (req, res) => {
  try {
    var api = new PowerSchoolAPI(req.query.link);
    await api.setup();
    const user = await api.login(req.query.user, req.query.pass);

    if (!user) {
      return res.json({ error: "Invalid username or password" });
    }

    const students = await user.getStudentsInfo();
    const student = students[0]
    res.json({ name: student.student.getFormattedName() });

  } catch (err) {
    res.status(500).json({ error: "An error occurred" });
  }
});

app.get('/api/classes', async (req, res) => {
  try {
    var api = new PowerSchoolAPI(req.query.link);
    await api.setup();
    const user = await api.login(req.query.user, req.query.pass);

    if (!user) {
      return res.json({ error: "Invalid username or password" });
    }

    const students = await user.getStudentsInfo();
    const student = students[0]

    var reportingTerm = req.query.term ? req.query.term : "C1"
    var reportingTermIds = student.reportingTerms.filter(term => term.title == reportingTerm).map(term => term.termID)
    res.json(student.courses.filter(course => reportingTermIds.includes(course.termID)).map(course => course.title));

  } catch (err) {
    console.log(err)
    res.status(500).json({ error: "An error occurred" });
  }
})

app.get('/api/average', async (req, res) => {
  try {
    var api = new PowerSchoolAPI(req.query.link);
    await api.setup();
    const user = await api.login(req.query.user, req.query.pass);

    if (!user) {
      return res.json({ error: "Invalid username or password" });
    } 

    const students = await user.getStudentsInfo();
    const student = students[0]
    const courses = student.courses

    var reportingTerm = req.query.term ? req.query.term : "C1"

    const grades = student.finalGrades.filter(obj => student.reportingTerms.find(term => term.id == obj.reportingTermID).title == reportingTerm)

    // console.log(student.finalGrades.find(
    //   obj => student.reportingTerms.find(term => term.id == obj.reportingTermID).title == 
    //     student.reportingTerms.find(term => term.title == "ENG LANG ART RDG 6 HADV").title
    // ).grade)
    
    var result = {}

    grades.forEach(grade => {
      result[courses.find(course => course.id == grade.courseID).title] = grade.grade
    });
    res.json(result)
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});


app.get('/api/info', async (req, res) => {
  try {
    var api = new PowerSchoolAPI(req.query.link);
    await api.setup();
    const user = await api.login(req.query.user, req.query.pass);

    if (!user) {
      return res.json({ error: "Invalid username or password" });
    }

    const students = await user.getStudentsInfo();
    const student = students[0]
    var studentData = student.student
    dob = studentData.dateOfBirth

    info = {
      name: `${studentData.lastName}, ${studentData.firstName}${studentData.middleName ? " " + studentData.middleName : ""}`,
      grade: studentData.gradeLevel.toString(),
      school: student.schools[0].name,
      dob: `${dob.getMonth() + 1}/${dob.getDay()}/${dob.getFullYear()}`,
      "cohort-year": student.yearID
    }

    res.json(info)

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.get('/api/assignments', async (req, res) => {
  try {
    var api = new PowerSchoolAPI(req.query.link);
    await api.setup();
    const user = await api.login(req.query.user, req.query.pass);

    if (!user) {
      return res.json({ error: "Invalid username or password" });
    }

    const students = await user.getStudentsInfo();
    const student = students[0]
    var courseName = "ENG LANG ART RDG 6 HADV"
    var courseId = student.courses.find(course => course.title == courseName).id
    var courseAssignments = [[
      "Date Due",
      "Date Assigned",
      "Assignment",
      "Category",
      "Score",
      "Total Points",
      "Weight",
      "Weighted Score",
      "Weighted Total Points",
      "Percentage"
    ]]

    student.assignmentCategories.forEach(category => { 
      category.assignments.forEach(async assignment => { 
        if (assignment.courseID === courseId) { 
          var currentScore = assignment.getScore() 
          if (currentScore) {
            dueDate = assignment.dueDate
            courseAssignments.push([
              `${dueDate.getMonth() + 1}/${dueDate.getDay()}/${dueDate.getFullYear()}`, 
              `${dueDate.getMonth() + 1}/${dueDate.getDay()}/${dueDate.getFullYear()}`, 
              assignment.name, 
              category.name, 
              currentScore.score, 
              "1.00", 
              currentScore.score, 
              "100.00", 
              currentScore.score + "%"
            ]) 
          }
        } 
      }); 
    });

    result = {
      [courseName]:{
        average: "avg",
        assignments: courseAssignments,
        categories: []
      }
    }


    // var score = await courseAssignments[0].getScore()

    // res.json(inspect(student.assignmentCategories[0].assignments[0]))
    // res.json(jsonify(student.courses, 3))
    res.json(result)


  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
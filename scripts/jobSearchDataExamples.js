const oldJobExample = {
  _id: {
    $oid: "69ba2a287061bd7773423556",
  },
  job_title: "Tinker and Wake", //
  work_from: "remote", //
  recruiter: {
    //
    $oid: "69b63184064c92fca392c09d",
  },
  company_name: "Basement Industries LLC", //
  company_address: "Here (and there)", //
  company_city: "Kaysville", //
  company_state: "UT", //
  point_of_contact: "", //
  poc_title: "Nobody But Me", //
  interviews: null, //
  comments: null, //
  status: "offer", //
  archived: false, //
  user: {
    //
    $oid: "69993fe2de6af8dd0a1ae360",
  },
  date_applied: "2026-03-06T16:04:05.000Z", //
  primary_link: "", //
  primary_link_text: "", //
  secondary_link: "", //
  secondary_link_text: "", //
};

const newJobExample = {
  _id: "019db3d8-cd1c-7330-8e71-7e360b386472",
  userId: "019db36d-60ce-7b47-9cd2-2db80eff259f", //
  recruiterId: "019db3d8-cd17-716f-a3fd-f483af39be0e", //
  jobTitle: "Senior Software Engineer", //
  workFrom: "remote", //
  dateApplied: "2026-01-08", //
  companyName: "Stripe", //
  companyAddress: "", //
  companyCity: "San Francisco", //
  companyState: "CA", //
  pointOfContact: "", //
  pocTitle: "", //
  interviews: [], //
  comments: [], //
  status: "acked", //
  archived: false, //
  primaryLink: "", //
  primaryLinkText: "", //
  secondaryLink: "", //
  secondaryLinkText: "", //
  createdAt: {
    $date: "2026-04-22T06:20:23.196Z",
  },
  updatedAt: {
    $date: "2026-04-22T06:20:23.196Z",
  },
};

const oldRecruiterExample = {
  _id: {
    $oid: "69b62ee1064c92fca392c09b",
  },
  name: "Tina Hazlett",
  company: "Waterstone Human Capital",
  phone: "",
  email: "thazlett@waterstonehc.com",
  rating: 3,
  comments: [
    "Friendly, but I don't know much about her.",
    "Hardly ever see software jobs in their listings.",
  ],
  archived: false,
  user: {
    $oid: "69993fe2de6af8dd0a1ae360",
  },
};

const newRecruiterExample = {
  _id: "019db3d8-cd15-718e-8628-b5095ca48365",
  userId: "019db36d-60ce-7b47-9cd2-2db80eff259f",
  name: "No Recruiter",
  company: "",
  phone: "",
  email: "",
  rating: 0,
  comments: [],
  archived: false,
  createdAt: {
    $date: "2026-04-22T06:20:23.189Z",
  },
  updatedAt: {
    $date: "2026-04-22T06:20:23.189Z",
  },
};

package backends

import (
	"path/filepath"
	"testing"

	"github.com/iegomez/mosquitto-go-auth/hashing"
	log "github.com/sirupsen/logrus"
	. "github.com/smartystreets/goconvey/convey"
)

func TestFiles(t *testing.T) {
	//Initialize Files with mock password and acl files.
	authOpts := make(map[string]string)

	Convey("Given empty opts NewFiles should fail", t, func() {
		_, err := NewFiles(authOpts, log.DebugLevel, hashing.NewHasher(authOpts, "files"))
		So(err, ShouldBeError)
	})

	pwPath, _ := filepath.Abs("../test-files/passwords")
	aclPath, _ := filepath.Abs("../test-files/acls")
	authOpts["password_path"] = pwPath
	authOpts["acl_path"] = aclPath
	clientID := "test_client"

	Convey("Given valid params NewFiles should return a new files backend instance", t, func() {
		files, err := NewFiles(authOpts, log.DebugLevel, hashing.NewHasher(authOpts, "files"))
		So(err, ShouldBeNil)

		/*
			ACL file looks like this:

			user test1
			topic write test/topic/1
			topic read test/topic/2

			user test2
			topic read test/topic/+

			user test3
			topic read test/#

			user not_present
			topic read test/#

			pattern read test/%u

			pattern read test/%c
		*/

		// passwords are the same as users,
		// except for user4 that's not present in psswords and should be skipped when reading acls
		user1 := "test1"
		user2 := "test2"
		user3 := "test3"
		user4 := "not_present"

		Convey("All users but not present ones should have a record", func() {
			_, ok := files.Users[user1]
			So(ok, ShouldBeTrue)

			_, ok = files.Users[user2]
			So(ok, ShouldBeTrue)

			_, ok = files.Users[user3]
			So(ok, ShouldBeTrue)

			_, ok = files.Users[user4]
			So(ok, ShouldBeFalse)
		})

		Convey("Given a username and a correct password, it should correctly authenticate it", func() {
			authenticated := files.GetUser(user1, user1, clientID)
			So(authenticated, ShouldBeTrue)
		})

		Convey("Given a username and an incorrect password, it should not authenticate it", func() {
			authenticated := files.GetUser(user1, user2, clientID)
			So(authenticated, ShouldBeFalse)
		})

		//There are no superusers for files
		Convey("For any user superuser should return false", func() {
			superuser := files.GetSuperuser(user1)
			So(superuser, ShouldBeFalse)
		})

		testTopic1 := `test/topic/1`
		testTopic2 := `test/topic/2`
		testTopic3 := `test/other/1`
		testTopic4 := `other/1`
		readWriteTopic := "readwrite/topic"

		Convey("User 1 should be able to publish and not subscribe to test topic 1, and only subscribe but not publish to topic 2", func() {
			tt1 := files.CheckAcl(user1, testTopic1, clientID, 2)
			tt2 := files.CheckAcl(user1, testTopic1, clientID, 1)
			tt3 := files.CheckAcl(user1, testTopic2, clientID, 2)
			tt4 := files.CheckAcl(user1, testTopic2, clientID, 1)

			So(tt1, ShouldBeTrue)
			So(tt2, ShouldBeFalse)
			So(tt3, ShouldBeFalse)
			So(tt4, ShouldBeTrue)
		})

		Convey("User 1 should be able to subscribe or publish to a readwrite topic rule", func() {
			tt1 := files.CheckAcl(user1, readWriteTopic, clientID, 2)
			tt2 := files.CheckAcl(user1, readWriteTopic, clientID, 1)
			So(tt1, ShouldBeTrue)
			So(tt2, ShouldBeTrue)
		})

		Convey("User 2 should be able to read any test/topic/X but not any/other", func() {
			tt1 := files.CheckAcl(user2, testTopic1, clientID, 1)
			tt2 := files.CheckAcl(user2, testTopic2, clientID, 1)
			tt3 := files.CheckAcl(user2, testTopic3, clientID, 1)

			So(tt1, ShouldBeTrue)
			So(tt2, ShouldBeTrue)
			So(tt3, ShouldBeFalse)
		})

		Convey("User 3 should be able to read any test/X but not other/...", func() {
			tt1 := files.CheckAcl(user3, testTopic1, clientID, 1)
			tt2 := files.CheckAcl(user3, testTopic2, clientID, 1)
			tt3 := files.CheckAcl(user3, testTopic3, clientID, 1)
			tt4 := files.CheckAcl(user3, testTopic4, clientID, 1)

			So(tt1, ShouldBeTrue)
			So(tt2, ShouldBeTrue)
			So(tt3, ShouldBeTrue)
			So(tt4, ShouldBeFalse)
		})

		Convey("User 4 should not be able to read since it's not in the passwords file", func() {
			tt1 := files.CheckAcl(user4, testTopic1, clientID, 1)

			So(tt1, ShouldBeFalse)
		})

		//Now check against patterns.

		Convey("Given a topic that mentions username, acl check should pass", func() {
			tt1 := files.CheckAcl(user1, "test/test1", clientID, 1)
			So(tt1, ShouldBeTrue)
		})

		Convey("Given a topic that mentions clientid, acl check should pass", func() {
			tt1 := files.CheckAcl(user1, "test/test_client", clientID, 1)
			So(tt1, ShouldBeTrue)
		})

		//Halt files
		files.Halt()
	})
}
